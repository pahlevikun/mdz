import { test, expect } from "bun:test";
import { renderMarkdownHtml } from "../src/md-render";

test("heading and paragraph", () => {
  const html = renderMarkdownHtml("# Title\n\nhello world");
  expect(html).toContain("<h1>Title</h1>");
  expect(html).toContain("<p>hello world</p>");
});

test("fenced code escapes angle brackets", () => {
  const html = renderMarkdownHtml("```js\nconst a = 1 < 2;\n```");
  expect(html).toMatch(/<pre><code>[\s\S]*<\/code><\/pre>/);
  expect(html).toContain("const a = 1 &lt; 2;");
});

test("javascript: links are not rendered as anchors", () => {
  const html = renderMarkdownHtml("[x](javascript:alert(1))");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<a ");
});

test("unordered list", () => {
  const html = renderMarkdownHtml("- one\n- two");
  expect(html).toBe("<ul><li>one</li><li>two</li></ul>");
});
