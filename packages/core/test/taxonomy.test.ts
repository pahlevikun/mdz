import { test, expect } from "bun:test";
import { classifyPage, buildTaxonomy, applyOverrides } from "../src/taxonomy";
import type { OutlineNode } from "../src/types";

const outline = (nodes: OutlineNode[] = []): OutlineNode[] => nodes;
const bigOutline = (): OutlineNode[] =>
  Array.from({ length: 10 }, (_, i) => ({
    level: 2,
    title: `Section ${i}`,
    slug: `section-${i}`,
    children: [],
  }));

test("/pricing classifies as pricing with path signal", () => {
  const g = classifyPage("https://example.com/pricing", outline(), "");
  expect(g.kind).toBe("pricing");
  expect(g.confidence).toBeGreaterThanOrEqual(0.9);
  expect(g.signals.some((s) => s.toLowerCase().includes("path"))).toBe(true);
});

test("/privacy classifies as legal", () => {
  expect(classifyPage("https://example.com/privacy", outline(), "").kind).toBe("legal");
});

test("/docs/install classifies as docs", () => {
  expect(classifyPage("https://example.com/docs/install", outline(), "").kind).toBe("docs");
});

test("/blog/2026/10/thing is blog-post with confidence >= 0.8", () => {
  const g = classifyPage("https://example.com/blog/2026/10/thing", outline(), "");
  expect(g.kind).toBe("blog-post");
  expect(g.confidence).toBeGreaterThanOrEqual(0.8);
});

test("/blog/thing is blog-post between 0.5 and 0.6", () => {
  const g = classifyPage("https://example.com/blog/thing", outline(), "");
  expect(g.kind).toBe("blog-post");
  expect(g.confidence).toBeGreaterThanOrEqual(0.5);
  expect(g.confidence).toBeLessThanOrEqual(0.6);
});

test("root landing vs unknown with large outline", () => {
  const landing = classifyPage("https://example.com/", outline(), "");
  expect(landing.kind).toBe("landing");
  expect(landing.confidence).toBe(0.5);
  const unknown = classifyPage("https://example.com/xyz", bigOutline(), "");
  expect(unknown.kind).toBe("unknown");
});

test("applyOverrides replaces one entry and leaves others", () => {
  const t = buildTaxonomy("https://example.com/", [
    { url: "https://example.com/pricing", outline: [], text: "" },
    { url: "https://example.com/docs", outline: [], text: "" },
  ]);
  const out = applyOverrides(t, { "https://example.com/pricing": "custom-kind" });
  expect(out.by_url["https://example.com/pricing"]).toEqual({
    kind: "custom-kind",
    confidence: 1,
    signals: ["overridden by config"],
  });
  expect(out.by_url["https://example.com/docs"]).toEqual(t.by_url["https://example.com/docs"]);
});
