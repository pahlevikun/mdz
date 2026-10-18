import { test, expect } from "bun:test";
import { buildChunks } from "../src/chunk";

const big = (n: number) => Array.from({ length: n }, (_, i) => `paragraph number ${i} with some words`).join("\n\n");

test("splits on h2 and keeps ids stable and unique", () => {
  const md = `# Doc\nintro\n\n## Install\n${big(5)}\n\n## Usage\n${big(5)}`;
  const c = buildChunks(md, 2000);
  const ids = c.map(x => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[0]).toMatch(/^\d{2}-/);
  expect(buildChunks(md, 2000).map(x => x.id)).toEqual(ids);
});

test("hard-splits a section larger than the budget", () => {
  const md = `## Long\n${big(400)}`;
  const c = buildChunks(md, 500);
  expect(c.length).toBeGreaterThan(1);
  for (const x of c) expect(x.tokens).toBeLessThanOrEqual(650);
});

test("line ranges cover the document without overlap", () => {
  const md = `# A\ntext\n## B\nmore`;
  const c = buildChunks(md, 2000);
  for (const x of c) {
    expect(x.startLine).toBeGreaterThan(0);
    expect(x.endLine).toBeGreaterThanOrEqual(x.startLine);
    expect(md.split("\n").slice(x.startLine - 1, x.endLine).join("\n")).toBe(x.markdown);
  }
});

test("path carries the ancestor titles", () => {
  const md = `# A\n## B\n### C\nbody`;
  const c = buildChunks(md, 2000);
  expect(c.at(-1)!.path).toEqual(["A", "B"]);
});
