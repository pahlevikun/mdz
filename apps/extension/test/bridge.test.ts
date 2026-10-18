import { test, expect } from "bun:test";
import { loadDocument } from "../../../packages/core/src/dom";
import { extractFromDocument } from "../src/core-bridge";

const HTML = `<html><head><title>Doc</title></head><body><main>
<h1>Doc</h1><p>${"alpha ".repeat(200)}</p><h2>Two</h2><p>${"beta ".repeat(200)}</p>
</main></body></html>`;

const liveDoc = () => loadDocument(HTML, "https://example.com") as unknown as Document;

test("produces the same Doc shape as the CLI path", () => {
  const d = extractFromDocument(liveDoc(), "https://example.com", {});
  expect(d.title).toBe("Doc");
  expect(d.chunks.length).toBeGreaterThan(0);
  expect(d.tokens.o200k).toBeGreaterThan(0);
  expect(d.markdown).toContain("beta");
});

test("selection text short-circuits extraction", () => {
  const d = extractFromDocument(liveDoc(), "https://example.com", { selectionText: "just these words" });
  expect(d.extractor).toBe("fallback");
  expect(d.markdown).toBe("just these words");
});
