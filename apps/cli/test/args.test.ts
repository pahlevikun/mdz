import { test, expect } from "bun:test";
import { parseArgs } from "../src/args";

test("url plus flags", () => {
  const o = parseArgs(["https://a.com/x", "--json", "--chunk", "4000", "--no-links"]);
  expect(o.url).toBe("https://a.com/x");
  expect(o.json).toBe(true);
  expect(o.chunk).toBe(4000);
  expect(o.links).toBe(false);
});

test("defaults", () => {
  const o = parseArgs(["https://a.com"]);
  expect(o.chunk).toBe(8000);
  expect(o.map).toBe(true);
  expect(o.split).toBe("");
});

test("missing url is an error", () => {
  expect(() => parseArgs(["--json"])).toThrow(/url/i);
});

test("unknown flag is an error", () => {
  expect(() => parseArgs(["https://a.com", "--nope"])).toThrow(/unknown flag/i);
});
