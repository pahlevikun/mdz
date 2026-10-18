import { test, expect } from "bun:test";
import { loadDocument, visibleClone, stripNoise } from "../src/dom";

const HTML = `<!doctype html><html><body>
  <nav>menu</nav>
  <main><h1>Title</h1><p>keep me</p>
    <div style="display:none">hidden one</div>
    <div aria-hidden="true">hidden two</div>
    <div hidden>hidden three</div>
    <script>var x=1</script>
  </main>
</body></html>`;

test("loadDocument gives a usable DOM", () => {
  const doc = loadDocument(HTML, "https://example.com");
  expect(doc.querySelector("h1")?.textContent).toBe("Title");
});

test("visibleClone drops display:none, aria-hidden and [hidden]", () => {
  const doc = loadDocument(HTML, "https://example.com");
  const clone = visibleClone(doc.querySelector("main")!);
  const text = clone.textContent ?? "";
  expect(text).toContain("keep me");
  expect(text).not.toContain("hidden one");
  expect(text).not.toContain("hidden two");
  expect(text).not.toContain("hidden three");
});

test("stripNoise removes nav/script/iframe/svg", () => {
  const doc = loadDocument(HTML, "https://example.com");
  const main = doc.querySelector("main")!;
  stripNoise(main);
  expect(main.textContent).not.toContain("var x=1");
});
