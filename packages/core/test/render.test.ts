import { test, expect } from "bun:test";
import { emptyDoc } from "../src/types";
import { renderMarkdown, renderJson } from "../src/render";
import { buildChunks } from "../src/chunk";

function sample() {
  const d = emptyDoc("https://example.com/post");
  d.finalUrl = "https://example.com/post";
  d.title = "Hello: a title";
  d.author = "Ada";
  d.published = "2026-10-01";
  d.domain = "example.com";
  d.lang = "en";
  d.wordCount = 42;
  d.charCount = 210;
  d.tokens = { o200k: 55, cl100k: 58 };
  d.fetchedAt = "2026-10-18T00:00:00.000Z";
  d.markdown = "# Intro\nhello\n\n## Install\nrun it";
  d.chunks = buildChunks(d.markdown, 8000);
  return d;
}

test("frontmatter is delimited and carries mdz metadata", () => {
  const md = renderMarkdown(sample(), { map: true });
  expect(md.startsWith("---\n")).toBe(true);
  expect(md).toContain('title: "Hello: a title"');
  expect(md).toContain("url: https://example.com/post");
  expect(md).toContain("tokens_o200k: 55");
  expect(md).toContain("extractor: defuddle");
  expect(md.split("---")[0]!.length).toBe(0);
});

test("body keeps the page markdown and can carry a page map", () => {
  const md = renderMarkdown(sample(), { map: true });
  expect(md).toContain("## Page map");
  expect(md).toContain("```text");
  expect(md).toContain("# Intro\nhello");
});

test("chunk manifest is optional and lists ids + tokens", () => {
  const withChunks = renderMarkdown(sample(), { chunks: true });
  expect(withChunks).toContain("## Chunks");
  expect(withChunks).toContain("01-intro");
  const without = renderMarkdown(sample(), {});
  expect(without).not.toContain("## Chunks");
});

test("json output is parseable and complete", () => {
  const j = JSON.parse(renderJson(sample()));
  expect(j.url).toBe("https://example.com/post");
  expect(Array.isArray(j.chunks)).toBe(true);
  expect(j.md).toContain("# Intro");
});
