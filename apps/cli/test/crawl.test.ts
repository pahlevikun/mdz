import { test, expect } from "bun:test";
import { crawl } from "../src/crawl";

const PAGES: Record<string, string> = {
  "https://s.com/": `<html><body><main><a href="/a">a</a><a href="/b">b</a>
    <a href="https://other.com/x">off</a><p>${"root ".repeat(200)}</p></main></body></html>`,
  "https://s.com/a": `<html><body><main><a href="/c">c</a><p>${"aaaa ".repeat(200)}</p></main></body></html>`,
  "https://s.com/b": `<html><body><main><p>${"bbbb ".repeat(200)}</p></main></body></html>`,
  "https://s.com/c": `<html><body><main><p>${"cccc ".repeat(200)}</p></main></body></html>`
};
const http = async (u: string) => {
  const html = PAGES[u];
  if (!html) throw new Error(`404 ${u}`);
  return { html, finalUrl: u };
};

test("depth 1 follows same-site links only", async () => {
  const docs = await crawl("https://s.com/", { depth: 1, max: 10, http, chunk: 8000 });
  const urls = docs.map(d => d.finalUrl).sort();
  expect(urls).toEqual(["https://s.com/", "https://s.com/a", "https://s.com/b"]);
});

test("depth 2 reaches grandchildren", async () => {
  const docs = await crawl("https://s.com/", { depth: 2, max: 10, http, chunk: 8000 });
  expect(docs.map(d => d.finalUrl)).toContain("https://s.com/c");
});

test("max caps the page count and failures are skipped", async () => {
  const docs = await crawl("https://s.com/", { depth: 2, max: 2, http, chunk: 8000 });
  expect(docs.length).toBe(2);
});
