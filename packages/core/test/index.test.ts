import { test, expect } from "bun:test";
import { extractUrl } from "../src/index";

const HTML = `<html lang="en"><head><title>T</title>
<meta name="author" content="Ada"><meta property="article:published_time" content="2026-10-01">
</head><body><main><h1>T</h1><p>${"word ".repeat(300)}</p>
<h2>Two</h2><p>${"more ".repeat(300)}</p></main></body></html>`;

const http = async () => ({ html: HTML, finalUrl: "https://example.com/post" });

test("produces a complete Doc", async () => {
  const d = await extractUrl("https://example.com/post", { http });
  expect(d.title).toBe("T");
  expect(d.author).toBe("Ada");
  expect(d.markdown.length).toBeGreaterThan(1000);
  expect(d.wordCount).toBeGreaterThan(500);
  expect(d.tokens.o200k).toBeGreaterThan(0);
  expect(d.outline.length).toBeGreaterThan(0);
  expect(d.chunks.length).toBeGreaterThan(0);
  expect(d.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("selector narrows the extraction to one subtree", async () => {
  const d = await extractUrl("https://example.com/post", { http, selector: "h2" });
  expect(d.markdown).not.toContain("word word word");
});

test("image stripping is the default", async () => {
  const withImg = HTML.replace("<p>", '<p><img src="x.png" alt="pic">');
  const d = await extractUrl("https://example.com/post", { http: async () => ({ html: withImg, finalUrl: "u" }) });
  expect(d.markdown).not.toContain("pic");
});
