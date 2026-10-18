import { expect, test } from "bun:test";
import {
  cssForMode,
  filterCss,
  parseTheme,
  pickEngine,
  themeKey,
} from "../src/theme";

test('filterCss("dark") contains invert, hue-rotate, img and video', () => {
  const css = filterCss("dark");
  expect(css).toContain("invert(1)");
  expect(css).toContain("hue-rotate(180deg)");
  expect(css).toContain("img");
  expect(css).toContain("video");
});

test('filterCss("light") and filterCss("auto") return empty', () => {
  expect(filterCss("light")).toBe("");
  expect(filterCss("auto")).toBe("");
});

test("cssForMode delegates to filterCss for all modes", () => {
  for (const mode of ["auto", "dark", "light"] as const) {
    expect(cssForMode(mode)).toBe(filterCss(mode));
  }
});

test("pickEngine prefers emulate when debugger granted", () => {
  expect(pickEngine(true)).toBe("emulate");
  expect(pickEngine(false)).toBe("filter");
});

test("themeKey is stable and parseTheme normalizes input", () => {
  const key = themeKey(7);
  expect(key).toContain("7");
  expect(themeKey(7)).toBe(key);
  expect(parseTheme(null)).toBe("auto");
  expect(parseTheme("bogus")).toBe("auto");
  expect(parseTheme("dark")).toBe("dark");
  expect(parseTheme("light")).toBe("light");
});

test('filterCss("dark") selectors are scoped under html', () => {
  const css = filterCss("dark");
  const blocks = css.split("}").filter((b) => b.includes("{"));
  for (const block of blocks) {
    const selectorPart = block.split("{")[0] ?? "";
    for (const sel of selectorPart.split(",")) {
      const trimmed = sel.trim();
      expect(trimmed.startsWith("html")).toBe(true);
    }
  }
});
