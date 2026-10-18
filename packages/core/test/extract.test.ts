import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { loadDocument } from "../src/dom";
import { extractContent, htmlToMarkdown } from "../src/extract";

const art = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./fixtures/app-shell.html", import.meta.url), "utf8");

test("article: keeps prose, drops nav and ads", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.extractor).toBe("defuddle");
  expect(r.markdown).toContain("## ");
  expect(r.markdown).not.toContain("Sign in");
  expect(r.markdown).not.toContain("Sponsored");
});

test("article: GFM table survives as a pipe table", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).toContain("| Model | Tokens |");
  expect(r.markdown).toContain("| --- | --- |");
});

test("article: code fence keeps its language", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).toMatch(/```(ts|js)\n/);
});

test("app shell: falls back to the whole page instead of 10 words", () => {
  const r = extractContent(loadDocument(app, "https://app.example.com"), "https://app.example.com");
  expect(r.extractor).toBe("fallback");
  expect(r.markdown.split(/\s+/).length).toBeGreaterThan(300);
});

test("never returns defuddle's partial-conversion garbage", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).not.toContain("Partial conversion completed");
});

test("htmlToMarkdown turns a bare string into markdown", () => {
  expect(htmlToMarkdown("<h2>Hi</h2><p>there</p>")).toBe("## Hi\n\nthere");
});
