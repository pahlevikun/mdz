export interface SnapshotOptions {
  maxNodes?: number;
  maxBytes?: number;
  maxSvgBytes?: number;
  maxImageBytes?: number;
}

export interface SnapshotResult {
  html: string;
  nodes: number;
  bytes: number;
  truncated: boolean;
  reason: string;
}

export interface SnapshotHooks {
  toDataUrl?: (url: string) => string | null;
  measure?: (el: Element) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  styleOf?: (el: Element) => CSSStyleDeclaration;
}

const SKIP_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "noscript",
  "template",
  "head",
]);

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function defaultMeasure(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function defaultStyleOf(el: Element): CSSStyleDeclaration {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (!view) {
    throw new Error("no defaultView");
  }
  return view.getComputedStyle(el);
}

function isTransparentBg(color: string): boolean {
  if (!color || color === "transparent") return true;
  const m = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/.exec(
    color,
  );
  if (m) {
    const a = m[1] !== undefined ? parseFloat(m[1]) : 1;
    return a === 0;
  }
  return false;
}

function keepBackgroundImage(bg: string): boolean {
  if (!bg || bg === "none") return false;
  if (/url\s*\(/i.test(bg)) return false;
  return true;
}

function keepTransform(t: string): boolean {
  if (!t || t === "none") return false;
  return /^(matrix|translate|scale)\(/i.test(t.trim());
}

function styleProps(
  style: CSSStyleDeclaration,
  rootRect: { left: number; top: number },
  rect: { left: number; top: number; width: number; height: number },
): string[] {
  const out: string[] = [
    "position:absolute",
    `left:${roundHalf(rect.left - rootRect.left)}px`,
    `top:${roundHalf(rect.top - rootRect.top)}px`,
    `width:${roundHalf(rect.width)}px`,
    `height:${roundHalf(rect.height)}px`,
    "box-sizing:border-box",
    "margin:0",
    "padding:0",
  ];

  const bg = style.backgroundColor;
  if (bg && !isTransparentBg(bg)) {
    out.push(`background-color:${bg}`);
  }
  const bgImg = style.backgroundImage;
  if (keepBackgroundImage(bgImg)) {
    out.push(`background-image:${bgImg}`);
  }
  if (style.color) out.push(`color:${style.color}`);
  if (style.fontFamily) out.push(`font-family:${style.fontFamily}`);
  if (style.fontSize) out.push(`font-size:${style.fontSize}`);
  if (style.fontWeight && style.fontWeight !== "400" && style.fontWeight !== "normal") {
    out.push(`font-weight:${style.fontWeight}`);
  }
  if (style.fontStyle && style.fontStyle !== "normal") {
    out.push(`font-style:${style.fontStyle}`);
  }
  if (style.lineHeight) out.push(`line-height:${style.lineHeight}`);
  if (style.letterSpacing && style.letterSpacing !== "normal") {
    out.push(`letter-spacing:${style.letterSpacing}`);
  }
  if (style.textAlign && style.textAlign !== "start" && style.textAlign !== "left") {
    out.push(`text-align:${style.textAlign}`);
  }
  const tdl = style.textDecorationLine;
  if (tdl && tdl !== "none") {
    out.push(`text-decoration-line:${tdl}`);
  }

  const bw = style.borderWidth;
  const bs = style.borderStyle;
  const bc = style.borderColor;
  if (bw && bw !== "0px" && bs && bs !== "none") {
    out.push(`border-width:${bw}`);
    out.push(`border-style:${bs}`);
    if (bc) out.push(`border-color:${bc}`);
  }
  const br = style.borderRadius;
  if (br && br !== "0px") out.push(`border-radius:${br}`);

  const boxShadow = style.boxShadow;
  if (boxShadow && boxShadow !== "none") {
    out.push(`box-shadow:${boxShadow}`);
  }

  const op = style.opacity;
  if (op && op !== "1") out.push(`opacity:${op}`);

  const tr = style.transform;
  if (keepTransform(tr)) out.push(`transform:${tr}`);

  if (style.overflow === "hidden") {
    out.push("overflow:hidden");
  }

  return out;
}

function fontOnlyProps(style: CSSStyleDeclaration): string[] {
  const out: string[] = [];
  if (style.color) out.push(`color:${style.color}`);
  if (style.fontFamily) out.push(`font-family:${style.fontFamily}`);
  if (style.fontSize) out.push(`font-size:${style.fontSize}`);
  if (style.fontWeight) out.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) out.push(`font-style:${style.fontStyle}`);
  if (style.lineHeight) out.push(`line-height:${style.lineHeight}`);
  if (style.letterSpacing) out.push(`letter-spacing:${style.letterSpacing}`);
  if (style.textAlign) out.push(`text-align:${style.textAlign}`);
  const tdl = style.textDecorationLine;
  if (tdl && tdl !== "none") {
    out.push(`text-decoration-line:${tdl}`);
  }
  return out;
}

function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function singleTextChild(el: Element): string | null {
  let text: string | null = null;
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes.item(i);
    if (!n) continue;
    if (n.nodeType === 1) return null;
    if (n.nodeType === 3) {
      if (text !== null) return null;
      text = n.textContent ?? "";
    }
  }
  return text;
}

export function snapshotForFigma(
  root: Element,
  opts?: SnapshotOptions,
  hooks?: SnapshotHooks,
): SnapshotResult {
  const maxNodes = opts?.maxNodes ?? 5000;
  const maxBytes = opts?.maxBytes ?? 2 * 1024 * 1024;
  const maxSvgBytes = opts?.maxSvgBytes ?? 400 * 1024;
  // One photo can be most of the budget. Keep the layout box, drop the pixels.
  const maxImageBytes = opts?.maxImageBytes ?? 120 * 1024;

  let omittedImages = 0;

  const measure = hooks?.measure ?? defaultMeasure;
  const styleOf = hooks?.styleOf ?? defaultStyleOf;
  const toDataUrl = hooks?.toDataUrl ?? (() => null);

  const rootRect = measure(root);
  const baseUrl = root.ownerDocument?.URL ?? "about:blank";

  let nodes = 0;
  let bytes = 0;
  let truncated = false;
  let reason = "";
  const chunks: string[] = [];

  const hitBudget = (which: "nodes" | "bytes") => {
    truncated = true;
    const dropped =
      omittedImages > 0 ? `, ${omittedImages} large images left as links` : "";
    reason =
      which === "nodes"
        ? `node limit reached${dropped}`
        : `size limit reached${dropped}`;
  };

  const tryEmit = (html: string): boolean => {
    if (truncated) return false;
    if (nodes >= maxNodes) {
      hitBudget("nodes");
      return false;
    }
    if (bytes + html.length > maxBytes) {
      hitBudget("bytes");
      return false;
    }
    chunks.push(html);
    nodes += 1;
    bytes += html.length;
    return true;
  };

  const shouldSkip = (
    el: Element,
    style: CSSStyleDeclaration,
    rect: ReturnType<typeof measure>,
  ) => {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (rect.width < 1 || rect.height < 1) return true;
    if (style.display === "none") return true;
    if (style.visibility === "hidden") return true;
    if (style.opacity === "0") return true;
    return false;
  };

  const elementMarkup = (el: Element, style: CSSStyleDeclaration): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === "canvas" || tag === "video" || tag === "iframe") {
      return "";
    }
    if (tag === "img") {
      const raw = el.getAttribute("src") ?? "";
      let src = resolveUrl(raw, baseUrl);
      const data = toDataUrl(src);
      if (data && data.length <= maxImageBytes) {
        src = data;
      } else if (data) {
        omittedImages += 1;
      }
      return `<img src="${escapeAttr(src)}" alt="" style="width:100%;height:100%;display:block" />`;
    }
    if (tag === "svg") {
      const svg = (el as SVGSVGElement).outerHTML ?? "";
      if (svg.length > maxSvgBytes) return "";
      return svg;
    }

    const onlyText = singleTextChild(el);
    if (onlyText !== null) {
      return escapeText(onlyText);
    }

    let inner = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 1) {
        inner += walk(n as Element);
      } else if (n.nodeType === 3) {
        const t = n.textContent ?? "";
        if (t.trim().length === 0) continue;
        const spanStyle = fontOnlyProps(style).join(";");
        const styleAttr = spanStyle ? ` style="${escapeAttr(spanStyle)}"` : "";
        inner += `<span${styleAttr}>${escapeText(t)}</span>`;
      }
    }
    return inner;
  };

  function walk(el: Element): string {
    if (truncated) return "";

    const rect = measure(el);
    const style = styleOf(el);
    if (shouldSkip(el, style, rect)) return "";

    const tag = el.tagName.toLowerCase();
    const props = styleProps(style, rootRect, rect);
    const inner = elementMarkup(el, style);
    const html = `<div data-mdz="${escapeAttr(tag)}" style="${escapeAttr(props.join(";"))}">${inner}</div>`;

    if (!tryEmit(html)) return "";
    return html;
  }

  const innerTree = walk(root);

  const wrapStyle = [
    "position:relative",
    "box-sizing:border-box",
    `width:${roundHalf(rootRect.width)}px`,
    `height:${roundHalf(rootRect.height)}px`,
  ].join(";");
  const html = `<div style="${escapeAttr(wrapStyle)}">${innerTree}</div>`;

  return {
    html,
    nodes,
    bytes,
    truncated,
    reason,
  };
}
