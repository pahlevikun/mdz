import { test, expect } from "bun:test";
import { deriveTokens, normalizeColor, toDesignMd } from "../src/design-tokens";

test("normalizeColor parses common CSS color forms to lowercase hex", () => {
  expect(normalizeColor("#AABBCC")).toBe("#aabbcc");
  expect(normalizeColor("#abc")).toBe("#aabbcc");
  expect(normalizeColor("rgb(1,2,3)")).toBe("#010203");
  expect(normalizeColor("rgba(1,2,3,0.5)")).toBe("#010203");
  expect(normalizeColor("hsl(210,50%,40%)")).toBe("#336699");
  expect(normalizeColor("white")).toBe("#ffffff");
});

test("transparent and unknown colors return null; deriveTokens warns on unknown", () => {
  expect(normalizeColor("transparent")).toBeNull();
  expect(normalizeColor("rgba(0,0,0,0)")).toBeNull();
  expect(normalizeColor("notacolor")).toBeNull();

  const draft = deriveTokens({
    colors: [{ color: "notacolor", usage: 10 }],
    fonts: [],
    spacings: [],
    radii: [],
  });
  expect(draft.meta.warnings.some((w) => w.includes("notacolor"))).toBe(true);
});

test("role assignment: primary accent, neutral near-white, text near-black", () => {
  const draft = deriveTokens({
    colors: [
      { color: "#3366cc", usage: 50, role: "accent" },
      { color: "#f8f8f8", usage: 100, role: "background" },
      { color: "#111111", usage: 80, role: "text" },
      { color: "#2244aa", usage: 20, role: "border" },
    ],
    fonts: [],
    spacings: [],
    radii: [],
  });
  expect(draft.colors.primary).toBe("#3366cc");
  expect(draft.colors.neutral).toBe("#f8f8f8");
  expect(draft.colors.text).toBe("#111111");
});

test("secondary and tertiary require 12 RGB distance or are omitted with warning", () => {
  const far = deriveTokens({
    colors: [
      { color: "#ff0000", usage: 100, role: "accent" },
      { color: "#f0f0f0", usage: 90, role: "background" },
      { color: "#101010", usage: 80, role: "text" },
      { color: "#00ff00", usage: 70, role: "border" },
      { color: "#0000ff", usage: 60, role: "border" },
    ],
    fonts: [],
    spacings: [],
    radii: [],
  });
  expect(far.colors.secondary).toBeDefined();
  expect(far.colors.tertiary).toBeDefined();
  const p = far.colors.primary!;
  const s = far.colors.secondary!;
  const t = far.colors.tertiary!;
  const dist = (a: string, b: string) => {
    const parse = (h: string) => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16),
    ];
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    return (
      Math.abs(ar! - br!) + Math.abs(ag! - bg!) + Math.abs(ab! - bb!)
    );
  };
  expect(dist(p, s)).toBeGreaterThanOrEqual(12);
  expect(dist(p, t)).toBeGreaterThanOrEqual(12);
  expect(dist(s, t)).toBeGreaterThanOrEqual(12);

  const near = deriveTokens({
    colors: [
      { color: "#ff0000", usage: 100, role: "accent" },
      { color: "#f0f0f0", usage: 90, role: "background" },
      { color: "#101010", usage: 80, role: "text" },
    ],
    fonts: [],
    spacings: [],
    radii: [],
  });
  expect(near.colors.secondary).toBeUndefined();
  expect(near.meta.warnings.some((w) => w.includes("secondary"))).toBe(true);
});

test("typography: three headings and two body sizes yield h1-h3 and body-md, body-sm", () => {
  const draft = deriveTokens({
    colors: [],
    fonts: [
      { family: "Inter", size: "32px", weight: 700, lineHeight: "1.2", usage: 10, heading: true },
      { family: "Inter", size: "24px", weight: 600, lineHeight: "1.3", usage: 8, heading: true },
      { family: "Inter", size: "20px", weight: 600, lineHeight: "1.3", usage: 6, heading: true },
      { family: "Inter", size: "16px", weight: 400, lineHeight: "1.5", usage: 100 },
      { family: "Inter", size: "14px", weight: 400, lineHeight: "1.5", usage: 40 },
    ],
    spacings: [],
    radii: [],
  });
  expect(new Set(Object.keys(draft.typography))).toEqual(
    new Set(["h1", "h2", "h3", "body-md", "body-sm"]),
  );
  expect(draft.typography.h1?.fontSize).toBe("32px");
});

test("spacing keeps values appearing at least twice", () => {
  const draft = deriveTokens({
    colors: [],
    fonts: [],
    spacings: ["8px", "8px", "8px", "16px", "16px", "3px"],
    radii: [],
  });
  expect(Object.keys(draft.spacing)).toHaveLength(2);
  expect(draft.spacing.xs).toBe("8px");
  expect(draft.spacing.sm).toBe("16px");
});

test("rounded assigns pill for 9999px", () => {
  const draft = deriveTokens({
    colors: [],
    fonts: [],
    spacings: [],
    radii: ["4px", "8px", "8px", "9999px"],
  });
  expect(Object.keys(draft.rounded)).toHaveLength(3);
  expect(draft.rounded.pill).toBe("9999px");
});

test("toDesignMd frontmatter order and quoted hex", () => {
  const md = toDesignMd({
    colors: { primary: "#336699" },
    typography: {
      h1: { fontFamily: "Inter", fontSize: "2rem", fontWeight: 700, lineHeight: "1.2" },
    },
    spacing: { sm: "8px" },
    rounded: {},
    meta: {
      sampledColors: 1,
      sampledFonts: 1,
      warnings: [],
    },
  });
  expect(md.startsWith("---")).toBe(true);
  const end = md.indexOf("\n---", 4);
  expect(end).toBeGreaterThan(0);
  const fm = md.slice(0, end + 4);
  expect(fm).toContain('"#336699"');
  const colorsIdx = md.indexOf("## Colors");
  const typoIdx = md.indexOf("## Typography");
  const layoutIdx = md.indexOf("## Layout");
  expect(colorsIdx).toBeLessThan(typoIdx);
  expect(typoIdx).toBeLessThan(layoutIdx);
});

test("toDesignMd omits Layout when spacing is empty", () => {
  const md = toDesignMd({
    colors: { primary: "#000000" },
    typography: {},
    spacing: {},
    rounded: {},
    meta: {
      sampledColors: 1,
      sampledFonts: 0,
      warnings: [],
    },
  });
  expect(md.includes("## Layout")).toBe(false);
});

test("frontmatter has no unquoted hash color literals", () => {
  const md = toDesignMd({
    colors: { primary: "#aabbcc", secondary: "#112233" },
    typography: {},
    spacing: { md: "16px" },
    rounded: { sm: "4px" },
    meta: {
      sampledColors: 2,
      sampledFonts: 0,
      warnings: [],
    },
  });
  const fmEnd = md.indexOf("\n---", 4) + 4;
  const fm = md.slice(0, fmEnd);
  for (const line of fm.split("\n")) {
    if (line.includes("#") && !line.includes('"#')) {
      expect(line).not.toMatch(/:\s*#[0-9a-f]{3,8}/i);
    }
  }
});
