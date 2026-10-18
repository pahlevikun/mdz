import { test, expect } from "bun:test";
import { buildOutline, pageMap, slugify } from "../src/outline";

const MD = `# Intro
text
## Install
### macOS
### Linux
## Usage
# Appendix`;

test("builds a nested tree from heading levels", () => {
  const t = buildOutline(MD);
  expect(t.length).toBe(2);
  expect(t[0]!.title).toBe("Intro");
  expect(t[0]!.children.map(c => c.title)).toEqual(["Install", "Usage"]);
  expect(t[0]!.children[0]!.children.map(c => c.title)).toEqual(["macOS", "Linux"]);
});

test("ignores headings inside fenced code", () => {
  const t = buildOutline("```\n# not a heading\n```\n# real");
  expect(t.map(n => n.title)).toEqual(["real"]);
});

test("slugify is url-safe and stable", () => {
  expect(slugify("Install & Setup (v2)")).toBe("install-setup-v2");
  expect(slugify("  ")).toBe("section");
});

test("pageMap renders an ascii tree", () => {
  const map = pageMap(buildOutline(MD), "My Page");
  expect(map).toContain("├── Install");
  expect(map).toContain("│   ├── macOS");
  expect(map).toContain("```text");
});
