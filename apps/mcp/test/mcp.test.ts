import { test, expect } from "bun:test";
import { handlers } from "../src/server";

const http = async () => ({
  html: `<html><head><title>T</title></head><body><main><h3>T</h3><p>${"word ".repeat(80)}</p><h2>Second</h2><p>${"more ".repeat(80)}</p></main></body></html>`,
  finalUrl: "https://example.com/a"
});

test("outline is cheap and lists chunk ids", async () => {
  const r = await handlers.outline({ url: "https://example.com/a" }, { http, chunk: 300 });
  expect(r).toContain("01-");
  expect(r.split(/\s+/).length).toBeLessThan(400);
});

test("read without chunk returns the first chunk and names the rest", async () => {
  const r = await handlers.read({ url: "https://example.com/a", max_tokens: 300 }, { http, chunk: 300 });
  expect(r).toContain("chunk 01-");
  expect(r).toMatch(/more chunks/i);
});

test("read with chunk returns exactly that chunk", async () => {
  const first = await handlers.read({ url: "https://example.com/a", chunk: "01-t" }, { http, chunk: 300 });
  const second = await handlers.read({ url: "https://example.com/a", chunk: "02-second" }, { http, chunk: 300 });
  expect(first).not.toBe(second);
  expect(second).toContain("more more more");
});

test("unknown chunk id errors with the valid ids", async () => {
  await expect(handlers.read({ url: "https://example.com/a", chunk: "nope" }, { http, chunk: 300 }))
    .rejects.toThrow(/01-/);
});

const designHttp = async () => ({
  html: `<!DOCTYPE html><html><head><title>Design</title><style>
body{color:#ffffff;background:#16181d}
a{color:#2f6feb}
.card{border:1px solid #2f6feb;padding:8px;border-radius:6px}
p{font-family:Inter;font-size:16px;font-weight:400;line-height:1.5;padding:8px}
</style></head><body><p>Hi</p></body></html>`,
  finalUrl: "https://example.com/design",
});

test("mdz_design_tokens returns design markdown from declared styles", async () => {
  const r = await handlers.designTokens(
    { url: "https://example.com/design" },
    { http: designHttp, chunk: 8000 },
  );
  expect(r.startsWith("---")).toBe(true);
  expect(r).toContain("primary");
  expect(r).toContain("#2f6feb");
  expect(r).toMatch(/declared/i);
});

test("mdz_design_tokens without inline or style blocks warns instead of inventing primary", async () => {
  const bare = async () => ({
    html: "<html><head><title>Plain</title></head><body><p>text</p></body></html>",
    finalUrl: "https://example.com/plain",
  });
  const r = await handlers.designTokens(
    { url: "https://example.com/plain" },
    { http: bare, chunk: 8000 },
  );
  expect(r.startsWith("---")).toBe(true);
  expect(r).toMatch(/warnings:/i);
  expect(r).toMatch(/primary/i);
  expect(r).not.toMatch(/^\s*primary:/m);
  expect(r).not.toContain('primary: "#');
});
