import type { ColorSample, FontSample, SampleSet } from "./design-tokens";
import { normalizeColor } from "./design-tokens";

const MAX_DECLARATIONS = 5000;

const SKIP_COLOR = new Set(["transparent", "none", "inherit", "initial", "unset", "auto"]);
const SKIP_SPACING = new Set(["0", "auto", "inherit", "initial", "unset", "none"]);

const COLOR_PROPS =
  /^(color|background(?:-color)?|border(?:-[a-z]+)?(?:-color)?|outline-color|fill|stroke|box-shadow)$/;

const SPACING_PROPS = /^(padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?$/;

const COLOR_IN_VALUE =
  /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;

function colorRole(prop: string): ColorSample["role"] | undefined {
  const p = prop.toLowerCase();
  if (p.startsWith("background")) return "background";
  if (p === "color") return "text";
  if (p.startsWith("border") || p.startsWith("outline")) return "border";
  return undefined;
}

function isHeadingSelector(selector: string): boolean {
  const s = selector.trim();
  return /^h[1-6]\b/.test(s) || /<h[1-6]/i.test(s);
}

function splitDeclarations(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      const piece = cur.trim();
      if (piece) {
        const colon = piece.indexOf(":");
        if (colon > 0) {
          out.push([piece.slice(0, colon).trim().toLowerCase(), piece.slice(colon + 1).trim()]);
        }
      }
      cur = "";
      continue;
    }
    cur += ch;
  }
  const piece = cur.trim();
  if (piece) {
    const colon = piece.indexOf(":");
    if (colon > 0) {
      out.push([piece.slice(0, colon).trim().toLowerCase(), piece.slice(colon + 1).trim()]);
    }
  }
  return out;
}

function extractRuleBlocks(css: string): Array<{ selector: string; body: string }> {
  const results: Array<{ selector: string; body: string }> = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    let selStart = open - 1;
    while (selStart >= 0 && css[selStart] !== "}") selStart--;
    selStart++;
    const selector = css.slice(selStart, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (selector.startsWith("@media") || selector.startsWith("@supports")) {
      results.push(...extractRuleBlocks(body));
    } else if (!selector.startsWith("@")) {
      results.push({ selector, body });
    }
    i = j;
  }
  return results;
}

function extractColorsFromValue(value: string): string[] {
  const found: string[] = [];
  const lower = value.toLowerCase().trim();
  if (SKIP_COLOR.has(lower)) return found;
  if (lower.startsWith("var(")) return found;

  const matches = value.match(COLOR_IN_VALUE);
  if (matches) {
    for (const m of matches) found.push(m);
    return found;
  }

  if (normalizeColor(value)) found.push(value);
  return found;
}

function extractPxValues(value: string): string[] {
  const out: string[] = [];
  const parts = value.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const v = part.trim().toLowerCase();
    if (SKIP_SPACING.has(v)) continue;
    if (/^-?\d+(?:\.\d+)?px$/.test(v)) out.push(v);
  }
  return out;
}

function mergeColor(samples: ColorSample[], color: string, role: ColorSample["role"] | undefined, n: number) {
  const existing = samples.find(
    (s) => s.color === color && (s.role ?? "") === (role ?? ""),
  );
  if (existing) existing.usage += n;
  else samples.push({ color, usage: n, ...(role !== undefined ? { role } : {}) });
}

export function sampleStyles(css: string): SampleSet {
  const colors: ColorSample[] = [];
  const fontMap = new Map<string, FontSample>();
  const spacings: string[] = [];
  const radii: string[] = [];
  let declCount = 0;
  let capped = false;

  const blocks = css.includes("{") ? extractRuleBlocks(css) : [{ selector: "", body: css }];

  for (const { selector, body } of blocks) {
    const heading = isHeadingSelector(selector);
    const decls = splitDeclarations(body);
    const fontScratch: Record<string, string> = {};

    for (const [prop, value] of decls) {
      if (capped) break;
      declCount++;
      if (declCount > MAX_DECLARATIONS) {
        capped = true;
        break;
      }

      if (prop.startsWith("--")) {
        const cols = extractColorsFromValue(value);
        for (const c of cols) mergeColor(colors, c, undefined, 1);
        continue;
      }

      if (COLOR_PROPS.test(prop)) {
        for (const c of extractColorsFromValue(value)) {
          mergeColor(colors, c, colorRole(prop), 1);
        }
      }

      if (prop === "font-family") fontScratch.family = value.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") ?? value;
      if (prop === "font-size") fontScratch.size = value;
      if (prop === "font-weight") fontScratch.weight = value;
      if (prop === "line-height") fontScratch.lineHeight = value;

      if (SPACING_PROPS.test(prop)) {
        for (const px of extractPxValues(value)) spacings.push(px);
      }

      if (prop === "border-radius") {
        for (const px of extractPxValues(value)) radii.push(px);
      }
    }

    if (
      fontScratch.family &&
      fontScratch.size &&
      fontScratch.weight &&
      fontScratch.lineHeight
    ) {
      const weight = Number.parseInt(fontScratch.weight, 10) || 400;
      const key = `${fontScratch.family}|${fontScratch.size}|${weight}|${heading ? "h" : "b"}`;
      const cur = fontMap.get(key);
      const sample: FontSample = {
        family: fontScratch.family,
        size: fontScratch.size,
        weight,
        lineHeight: fontScratch.lineHeight,
        usage: (cur?.usage ?? 0) + 1,
        heading,
      };
      fontMap.set(key, sample);
    }
  }

  return {
    colors,
    fonts: [...fontMap.values()],
    spacings,
    radii,
  };
}
