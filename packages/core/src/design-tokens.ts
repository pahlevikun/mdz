export interface ColorSample {
  color: string;
  usage: number;
  role?: "background" | "text" | "border" | "accent";
}

export interface FontSample {
  family: string;
  size: string;
  weight: number;
  lineHeight: string;
  usage: number;
  heading?: boolean;
}

export interface SampleSet {
  colors: ColorSample[];
  fonts: FontSample[];
  spacings: string[];
  radii: string[];
  pageTitle?: string;
  pageUrl?: string;
}

export interface TokenDraft {
  colors: Record<string, string>;
  typography: Record<
    string,
    { fontFamily: string; fontSize: string; fontWeight: number; lineHeight: string }
  >;
  spacing: Record<string, string>;
  rounded: Record<string, string>;
  meta: { sampledColors: number; sampledFonts: number; warnings: string[] };
}

type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, Rgba> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
};

const SPACING_KEYS = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const ROUNDED_KEYS = ["sm", "md", "lg", "pill"] as const;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex({ r, g, b }: Rgba): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function parseRgbFunction(inner: string): Rgba | null {
  const parts = inner
    .trim()
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  let a = 1;
  if (parts.length >= 4) {
    a = Number(parts[3]);
    if (!Number.isFinite(a)) return null;
  }
  return { r, g, b, a };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function parseHslFunction(inner: string): Rgba | null {
  const m = inner.trim().match(
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%(?:\s*[,/]\s*(-?\d+(?:\.\d+)?))?$/,
  );
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]);
  const l = Number(m[3]);
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  if (![h, s, l, a].every((n) => Number.isFinite(n))) return null;
  const { r, g, b } = hslToRgb(h, s, l);
  return { r, g, b, a };
}

export function normalizeColor(value: string): string | null {
  try {
    const raw = value.trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const named = NAMED[lower as keyof typeof NAMED];
    if (named) {
      if (named.a === 0) return null;
      return toHex(named);
    }

    if (lower.startsWith("#")) {
      const hex = lower.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
        const g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
        const b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
        return toHex({ r, g, b, a: 1 });
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].some((n) => Number.isNaN(n))) return null;
        return toHex({ r, g, b, a: 1 });
      }
      if (hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const a = parseInt(hex.slice(6, 8), 16) / 255;
        if ([r, g, b].some((n) => Number.isNaN(n)) || Number.isNaN(a)) return null;
        if (a === 0) return null;
        return toHex({ r, g, b, a: 1 });
      }
      return null;
    }

    const rgbMatch = lower.match(/^rgba?\((.*)\)$/);
    if (rgbMatch?.[1] !== undefined) {
      const c = parseRgbFunction(rgbMatch[1]);
      if (!c || c.a === 0) return null;
      return toHex(c);
    }

    const hslMatch = lower.match(/^hsla?\((.*)\)$/);
    if (hslMatch?.[1] !== undefined) {
      const c = parseHslFunction(hslMatch[1]);
      if (!c || c.a === 0) return null;
      return toHex(c);
    }

    return null;
  } catch {
    return null;
  }
}

function rgbDistance(a: Rgba, b: Rgba): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function saturation(c: Rgba): number {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 100;
}

function luminance(c: Rgba): number {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

function parsePx(value: string): number | null {
  const v = value.trim().toLowerCase();
  const px = v.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (px) return Number(px[1]);
  const rem = v.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (rem) return Number(rem[1]) * 16;
  const em = v.match(/^(-?\d+(?:\.\d+)?)em$/);
  if (em) return Number(em[1]) * 16;
  if (v === "50%") return 8;
  return null;
}

function isPillRadius(raw: string, px: number): boolean {
  const v = raw.trim().toLowerCase();
  return v === "9999px" || v === "50%" || px >= 100;
}

type ParsedColor = {
  sample: ColorSample;
  rgba: Rgba;
  hex: string;
};

function countSamplesForHex(samples: ParsedColor[], hex: string): number {
  return samples.filter((s) => s.hex === hex).length;
}

const colorRoleCounts = new WeakMap<TokenDraft, Record<string, number>>();

export function deriveTokens(set: SampleSet): TokenDraft {
  const warnings: string[] = [];
  const parsed: ParsedColor[] = [];

  for (const sample of set.colors) {
    const hex = normalizeColor(sample.color);
    if (hex === null) {
      if (sample.color.trim().toLowerCase() !== "transparent") {
        warnings.push(`unknown or invalid color: ${sample.color}`);
      }
      continue;
    }
    const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
    const rgba: Rgba = m
      ? {
          r: parseInt(m[1]!, 16),
          g: parseInt(m[2]!, 16),
          b: parseInt(m[3]!, 16),
          a: 1,
        }
      : { r: 0, g: 0, b: 0, a: 1 };
    parsed.push({ sample, rgba, hex });
  }

  const colors: Record<string, string> = {};
  const roleCounts: Record<string, number> = {};
  const usedHexes = new Set<string>();

  const byUsage = [...parsed].sort((a, b) => b.sample.usage - a.sample.usage);

  const neutralPick = byUsage.find((p) => saturation(p.rgba) < 10);
  if (neutralPick) {
    colors.neutral = neutralPick.hex;
    roleCounts.neutral = countSamplesForHex(parsed, neutralPick.hex);
    usedHexes.add(neutralPick.hex);
  } else {
    warnings.push("could not assign neutral: no near-grey sample");
  }

  let primaryPick: ParsedColor | undefined;
  for (const role of ["accent", "background", "border"] as const) {
    primaryPick = byUsage.find((p) => saturation(p.rgba) >= 25 && p.sample.role === role);
    if (primaryPick) break;
  }
  if (primaryPick) {
    colors.primary = primaryPick.hex;
    roleCounts.primary = countSamplesForHex(parsed, primaryPick.hex);
    usedHexes.add(primaryPick.hex);
  } else {
    warnings.push("could not assign primary: no saturated sample");
  }

  const primaryRgba = primaryPick?.rgba;
  const neutralRgba = neutralPick?.rgba;

  let textPick = byUsage.find((p) => p.sample.role === "text" && luminance(p.rgba) < 0.5);
  if (!textPick) {
    textPick = [...byUsage].sort((a, b) => luminance(a.rgba) - luminance(b.rgba))[0];
  }
  if (textPick) {
    colors.text = textPick.hex;
    roleCounts.text = countSamplesForHex(parsed, textPick.hex);
    usedHexes.add(textPick.hex);
  } else {
    warnings.push("could not assign text: no text sample");
  }

  function farEnough(p: ParsedColor, refs: Rgba[]): boolean {
    return refs.every((ref) => rgbDistance(p.rgba, ref) >= 12);
  }

  const primaryRef = primaryRgba;
  const neutralRef = neutralRgba;
  const refsForSecondary: Rgba[] = [];
  if (primaryRef) refsForSecondary.push(primaryRef);
  if (neutralRef) refsForSecondary.push(neutralRef);

  const secondaryPick = byUsage.find(
    (p) => !usedHexes.has(p.hex) && refsForSecondary.length > 0 && farEnough(p, refsForSecondary),
  );
  if (secondaryPick) {
    colors.secondary = secondaryPick.hex;
    roleCounts.secondary = countSamplesForHex(parsed, secondaryPick.hex);
    usedHexes.add(secondaryPick.hex);
  } else if (refsForSecondary.length > 0) {
    warnings.push("could not assign secondary: no distinct color at least 12 RGB units away");
  }

  const secondaryRgba = secondaryPick?.rgba;
  const refsForTertiary: Rgba[] = [...refsForSecondary];
  if (secondaryRgba) refsForTertiary.push(secondaryRgba);

  const tertiaryPick = byUsage.find(
    (p) => !usedHexes.has(p.hex) && refsForTertiary.length > 0 && farEnough(p, refsForTertiary),
  );
  if (tertiaryPick) {
    colors.tertiary = tertiaryPick.hex;
    roleCounts.tertiary = countSamplesForHex(parsed, tertiaryPick.hex);
    usedHexes.add(tertiaryPick.hex);
  } else if (refsForTertiary.length > 0) {
    warnings.push("could not assign tertiary: no distinct color at least 12 RGB units away");
  }

  const fontGroups = new Map<string, FontSample>();
  for (const f of set.fonts) {
    const key = `${f.heading ? "h" : "b"}:${f.size}:${f.weight}`;
    const cur = fontGroups.get(key);
    if (!cur || f.usage > cur.usage) fontGroups.set(key, f);
  }

  const headings = [...fontGroups.entries()]
    .filter(([k]) => k.startsWith("h:"))
    .map(([, v]) => v)
    .sort((a, b) => (parsePx(b.size) ?? 0) - (parsePx(a.size) ?? 0));

  const bodies = [...fontGroups.entries()]
    .filter(([k]) => k.startsWith("b:"))
    .map(([, v]) => v)
    .sort((a, b) => (parsePx(b.size) ?? 0) - (parsePx(a.size) ?? 0));

  const typography: TokenDraft["typography"] = {};
  const usedTypo = new Set<string>();

  function typoSig(t: FontSample): string {
    return `${t.family}|${t.size}|${t.weight}|${t.lineHeight}`;
  }

  function assignTypo(key: string, sample: FontSample | undefined) {
    if (!sample) return;
    const sig = typoSig(sample);
    if (usedTypo.has(sig)) return;
    usedTypo.add(sig);
    typography[key] = {
      fontFamily: sample.family,
      fontSize: sample.size,
      fontWeight: sample.weight,
      lineHeight: sample.lineHeight,
    };
  }

  assignTypo("h1", headings[0]);
  assignTypo("h2", headings[1]);
  assignTypo("h3", headings[2]);

  const bodiesByUsage = [...fontGroups.entries()]
    .filter(([k]) => k.startsWith("b:"))
    .map(([, v]) => v)
    .sort((a, b) => b.usage - a.usage);

  assignTypo("body-md", bodiesByUsage[0]);

  const bodySizesAsc = [...bodies].sort((a, b) => (parsePx(a.size) ?? 0) - (parsePx(b.size) ?? 0));
  const bodyMdPx = bodiesByUsage[0] ? parsePx(bodiesByUsage[0].size) : null;
  const bodySm = bodySizesAsc.find((b) => {
    const px = parsePx(b.size);
    return bodyMdPx !== null && px !== null && px < bodyMdPx;
  });
  assignTypo("body-sm", bodySm);

  const smallestBody = bodySizesAsc[0];
  assignTypo(
    "label",
    smallestBody && bodySm && typoSig(smallestBody) !== typoSig(bodySm) ? smallestBody : undefined,
  );

  const spacingCounts = new Map<string, number>();
  for (const s of set.spacings) {
    spacingCounts.set(s, (spacingCounts.get(s) ?? 0) + 1);
  }
  const spacingValues = [...spacingCounts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([v]) => v)
    .sort((a, b) => (parsePx(a) ?? 0) - (parsePx(b) ?? 0))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 6);

  const spacing: Record<string, string> = {};
  spacingValues.forEach((v, i) => {
    const key = SPACING_KEYS[i];
    if (key) spacing[key] = v;
  });

  const roundedCounts = new Map<string, number>();
  for (const r of set.radii) {
    roundedCounts.set(r, (roundedCounts.get(r) ?? 0) + 1);
  }
  const roundedCandidates = [...roundedCounts.keys()].sort(
    (a, b) => (parsePx(a) ?? 0) - (parsePx(b) ?? 0),
  );
  const roundedValues = roundedCandidates.slice(0, 4);

  const rounded: Record<string, string> = {};
  const nonPill = roundedValues.filter((v) => !isPillRadius(v, parsePx(v) ?? 0));
  const pillValues = roundedValues.filter((v) => isPillRadius(v, parsePx(v) ?? 0));
  nonPill.forEach((v, i) => {
    const key = ROUNDED_KEYS[i];
    if (key && key !== "pill") rounded[key] = v;
  });
  const pill = pillValues.at(-1);
  if (pill) rounded.pill = pill;

  const draft: TokenDraft = {
    colors,
    typography,
    spacing,
    rounded,
    meta: {
      sampledColors: parsed.length,
      sampledFonts: set.fonts.length,
      warnings,
    },
  };
  colorRoleCounts.set(draft, roleCounts);
  return draft;
}

function yamlScalar(v: string | number): string {
  if (typeof v === "number") return String(v);
  if (/^\d+\.\d+$/.test(v)) return JSON.stringify(v);
  if (v.includes("#") || /^[\d]/.test(v) && v.includes(".")) return JSON.stringify(v);
  if (/^[\d]/.test(v)) return JSON.stringify(v);
  const needsQuote = /^[\s>|*&!%@`#-]|: |\s$/.test(v) || /^(true|false|null|~)$/i.test(v);
  return needsQuote ? JSON.stringify(v) : v;
}

function quoteLineHeight(lh: string): string {
  if (/^\d+\.\d+$/.test(lh.trim())) return JSON.stringify(lh);
  return yamlScalar(lh);
}

export function toDesignMd(
  tokens: TokenDraft,
  opts?: { name?: string; description?: string },
): string {
  const name = opts?.name ?? "Untitled";
  const description = opts?.description ?? "Design tokens derived from a page.";
  const lines: string[] = ["---", "version: alpha", `name: ${yamlScalar(name)}`, `description: ${yamlScalar(description)}`];

  if (Object.keys(tokens.colors).length > 0) {
    lines.push("colors:");
    for (const [k, v] of Object.entries(tokens.colors)) {
      lines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  if (Object.keys(tokens.typography).length > 0) {
    lines.push("typography:");
    for (const [k, t] of Object.entries(tokens.typography)) {
      lines.push(`  ${k}:`);
      lines.push(`    fontFamily: ${yamlScalar(t.fontFamily)}`);
      lines.push(`    fontSize: ${yamlScalar(t.fontSize)}`);
      lines.push(`    fontWeight: ${t.fontWeight}`);
      lines.push(`    lineHeight: ${quoteLineHeight(t.lineHeight)}`);
    }
  }

  if (Object.keys(tokens.rounded).length > 0) {
    lines.push("rounded:");
    for (const [k, v] of Object.entries(tokens.rounded)) {
      lines.push(`  ${k}: ${yamlScalar(v)}`);
    }
  }

  if (Object.keys(tokens.spacing).length > 0) {
    lines.push("spacing:");
    for (const [k, v] of Object.entries(tokens.spacing)) {
      lines.push(`  ${k}: ${yamlScalar(v)}`);
    }
  }

  lines.push("---");

  const body: string[] = [];

  body.push("## Overview");
  body.push(
    `Derived from ${tokens.meta.sampledColors} color sample(s) and ${tokens.meta.sampledFonts} font sample(s).`,
  );
  if (tokens.meta.warnings.length > 0) {
    body.push(`${tokens.meta.warnings.length} warning(s) during token derivation.`);
  }

  if (Object.keys(tokens.colors).length > 0) {
    body.push("");
    body.push("## Colors");
    const counts = colorRoleCounts.get(tokens) ?? {};
    for (const [k, hex] of Object.entries(tokens.colors)) {
      const n = counts[k] ?? 0;
      body.push(`- **${k}**: ${hex} (${n} sample(s))`);
    }
  }

  if (Object.keys(tokens.typography).length > 0) {
    body.push("");
    body.push("## Typography");
    for (const [k, t] of Object.entries(tokens.typography)) {
      body.push(
        `- **${k}**: ${t.fontFamily}, ${t.fontSize}, weight ${t.fontWeight}, line-height ${t.lineHeight}`,
      );
    }
  }

  if (Object.keys(tokens.spacing).length > 0) {
    body.push("");
    body.push("## Layout");
    const count = Object.keys(tokens.spacing).length;
    body.push(`Spacing scale uses ${count} value(s):`);
    for (const [k, v] of Object.entries(tokens.spacing)) {
      body.push(`- **${k}**: ${v}`);
    }
  }

  if (Object.keys(tokens.rounded).length > 0) {
    body.push("");
    body.push("## Shapes");
    for (const [k, v] of Object.entries(tokens.rounded)) {
      body.push(`- **${k}**: ${v}`);
    }
  }

  const dos: string[] = [];
  const bodyMd = tokens.typography["body-md"];
  if (bodyMd) {
    dos.push(`Do keep body text at the measured ${bodyMd.fontSize}.`);
  }
  const spacingCount = Object.keys(tokens.spacing).length;
  if (spacingCount > 0) {
    dos.push(`Don't introduce extra spacing values; the page uses ${spacingCount}.`);
  }
  if (tokens.colors.primary) {
    dos.push(`Do use ${tokens.colors.primary} for primary actions and links.`);
  }

  if (dos.length >= 3) {
    body.push("");
    body.push("## Do's and Don'ts");
    for (const d of dos.slice(0, 3)) {
      body.push(`- ${d}`);
    }
  } else if (dos.length > 0) {
    body.push("");
    body.push("## Do's and Don'ts");
    for (const d of dos) {
      body.push(`- ${d}`);
    }
  }

  return [...lines, "", ...body].join("\n");
}
