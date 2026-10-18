import { test, expect, mock } from "bun:test";
import { run } from "../src/index";

const http = async () => ({
  html: `<html><head><title>T</title></head><body><main><h1>T</h1><p>${"word ".repeat(200)}</p><h2>Second</h2><p>${"more ".repeat(200)}</p></main></body></html>`,
  finalUrl: "https://example.com/a"
});

test("prints frontmatter markdown to stdout", async () => {
  let out = "";
  const code = await run(["https://example.com/a"], {
    http, stdout: (s) => { out += s; }, writeFile: () => {}, mkdir: () => {}
  });
  expect(code).toBe(0);
  expect(out.startsWith("---\n")).toBe(true);
  expect(out).toContain("## Page map");
});

test("--json prints a parseable manifest", async () => {
  let out = "";
  await run(["https://example.com/a", "--json"], {
    http, stdout: (s) => { out += s; }, writeFile: () => {}, mkdir: () => {}
  });
  const j = JSON.parse(out);
  expect(j.md.length).toBeGreaterThan(100);
});

test("--split writes one file per chunk plus index.json", async () => {
  const written: Record<string, string> = {};
  let made: string[] = [];
  await run(["https://example.com/a", "--split", "/tmp/out"], {
    http, stdout: () => {}, mkdir: (d: string) => { made.push(d); },
    writeFile: (p: string, c: string) => { written[p] = c; }
  });
  const keys = Object.keys(written);
  expect(made).toContain("/tmp/out");
  expect(keys.some(k => k.endsWith("index.json"))).toBe(true);
  expect(keys.filter(k => k.endsWith(".md")).length).toBeGreaterThan(0);
  expect(JSON.parse(written[keys.find(k => k.endsWith("index.json"))!]!).chunks.length)
    .toBeGreaterThan(0);
});
