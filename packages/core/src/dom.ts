import { parseHTML } from "linkedom";

const NOISE = 'script, style, link, meta, noscript, template, svg, canvas, iframe, nav, footer, aside, form, [aria-hidden="true"], [hidden]';

export function loadDocument(html: string, url: string): Document {
  const { document } = parseHTML(html);
  Object.defineProperty(document, "URL", { value: url, configurable: true });
  return document as unknown as Document;
}

// linkedom has no layout engine, so offsetParent is always null. Attribute and inline-style detection is the portable substitute for checkVisibility().
function isHidden(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = (el.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

export function visibleClone<T extends Element>(root: T): T {
  const clone = root.cloneNode(true) as T;
  const all = Array.from(clone.querySelectorAll("*"));
  for (const el of all) if (isHidden(el)) el.remove();
  return clone;
}

export function stripNoise(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(NOISE))) el.remove();
}
