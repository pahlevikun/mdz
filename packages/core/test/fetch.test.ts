import { test, expect, mock } from "bun:test";
import { fetchHtml } from "../src/fetch";

test("sends a browser UA and follows the redirect", async () => {
  const calls: any[] = [];
  globalThis.fetch = mock(async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response("<html><body>hi</body></html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" }
    });
  }) as any;
  const r = await fetchHtml("https://example.com", { timeoutMs: 5000 });
  expect(r.html).toContain("hi");
  expect(r.finalUrl).toBe("https://example.com");
  expect(calls[0].init.headers["user-agent"]).toContain("Mozilla/5.0");
});

test("rejects non-HTML content types", async () => {
  globalThis.fetch = mock(async () => new Response("%PDF", {
    status: 200, headers: { "content-type": "application/pdf" }
  })) as any;
  expect(fetchHtml("https://example.com/x.pdf", {})).rejects.toThrow(/content-type/i);
});
