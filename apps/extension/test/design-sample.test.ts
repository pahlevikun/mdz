import { test, expect } from "bun:test";
import { loadDocument } from "../../../packages/core/src/dom";
import { collectStyleText, designFilesFromStyles } from "../src/design-sample";

test("collectStyleText gathers style blocks and inline attributes", () => {
  const dom = loadDocument(
    `<html><head><style>.a{color:red}</style></head><body><p style="color:blue">x</p></body></html>`,
    "https://example.com/",
  );
  const text = collectStyleText(dom.documentElement);
  expect(text).toContain("color:red");
  expect(text).toContain("color:blue");
});

test("designFilesFromStyles quotes hex in frontmatter and emits color.dark.primary", () => {
  const { designMd, tokensJson } = designFilesFromStyles(
    ".x{color:#2f6feb}.y{color:#2f6feb;background:#16181d;border:1px solid #2f6feb}",
    "Page",
    "https://example.com/p",
  );
  expect(designMd).toContain('"#2f6feb"');
  const parsed = JSON.parse(tokensJson) as {
    color?: { dark?: { primary?: { $value: string } } };
  };
  expect(parsed.color?.dark?.primary?.$value).toBe("#2f6feb");
});

test("designFilesFromStyles with no colors omits primary from JSON", () => {
  const { designMd, tokensJson } = designFilesFromStyles(
    "p{font-size:14px}",
    "Empty",
    "https://example.com/e",
  );
  expect(designMd.startsWith("---")).toBe(true);
  const parsed = JSON.parse(tokensJson) as { color?: { dark?: Record<string, unknown> } };
  expect(parsed.color?.dark?.primary).toBeUndefined();
});
