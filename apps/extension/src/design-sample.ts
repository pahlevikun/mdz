import { sampleStyles } from "../../../packages/core/src/design-sample";
import { deriveTokens, toDesignMd } from "../../../packages/core/src/design-tokens";

const MAX_ELEMENTS = 5000;

export function collectStyleText(root: Element): string {
  const parts: string[] = [];
  const queue: Element[] = [root];
  let seen = 0;
  while (queue.length > 0 && seen < MAX_ELEMENTS) {
    const el = queue.shift()!;
    seen++;
    if (el.tagName === "STYLE") {
      parts.push(el.textContent ?? "");
    }
    const inline = el.getAttribute("style");
    if (inline) parts.push(inline);
    for (const child of el.children) queue.push(child);
  }
  return parts.join("\n");
}

function lineHeightJson(lh: string): string | number {
  const t = lh.trim();
  if (/^\d+\.\d+$/.test(t)) return Number(t);
  return t;
}

function tokensToDtcg(tokens: ReturnType<typeof deriveTokens>): Record<string, unknown> {
  const dark: Record<string, { $value: string; $type: "color" }> = {};
  for (const [key, hex] of Object.entries(tokens.colors)) {
    dark[key] = { $value: hex, $type: "color" };
  }

  const typography: Record<string, { $type: "typography"; $value: Record<string, unknown> }> = {};
  for (const [key, t] of Object.entries(tokens.typography)) {
    typography[key] = {
      $type: "typography",
      $value: {
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: lineHeightJson(t.lineHeight),
      },
    };
  }

  const spacing: Record<string, { $value: string; $type: "dimension" }> = {};
  for (const [key, v] of Object.entries(tokens.spacing)) {
    spacing[key] = { $value: v, $type: "dimension" };
  }

  const rounded: Record<string, { $value: string; $type: "dimension" }> = {};
  for (const [key, v] of Object.entries(tokens.rounded)) {
    rounded[key] = { $value: v, $type: "dimension" };
  }

  const out: Record<string, unknown> = {};
  if (Object.keys(dark).length > 0) out.color = { dark };
  if (Object.keys(typography).length > 0) out.typography = typography;
  if (Object.keys(spacing).length > 0) out.spacing = spacing;
  if (Object.keys(rounded).length > 0) out.rounded = rounded;
  return out;
}

export function designFilesFromStyles(
  css: string,
  title: string,
  url: string,
): { designMd: string; tokensJson: string } {
  const set = sampleStyles(css);
  set.pageTitle = title;
  set.pageUrl = url;
  const tokens = deriveTokens(set);
  const designMd = toDesignMd(tokens, {
    name: title || "Page",
    description: `Derived from declared styles at ${url}`,
  });
  const tokensJson = JSON.stringify(tokensToDtcg(tokens), null, 2);
  return { designMd, tokensJson };
}
