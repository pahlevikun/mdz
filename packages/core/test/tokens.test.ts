import { test, expect } from "bun:test";
import { countTokens, countTokensBoth } from "../src/tokens";

test("o200k count is a real tokenization, not chars/4", () => {
  const cjk = "中文网页转成马尔可夫格式"; // 12 chars
  expect(countTokens(cjk, "o200k")).toBeGreaterThan(8); // chars/4 would give 3
  const ascii = "the quick brown fox jumps over the lazy dog";
  expect(countTokens(ascii, "o200k")).toBe(9);
});

test("countTokensBoth returns both vocab sizes", () => {
  const r = countTokensBoth("hello world");
  expect(r.o200k).toBe(2);
  expect(r.cl100k).toBe(2);
});

test("empty string is zero", () => {
  expect(countTokens("", "o200k")).toBe(0);
});
