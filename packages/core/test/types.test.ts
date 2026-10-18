import { test, expect } from "bun:test";
import { emptyDoc } from "../src/types";

test("emptyDoc fills every required field", () => {
  const d = emptyDoc("https://example.com/a");
  expect(d.url).toBe("https://example.com/a");
  expect(d.markdown).toBe("");
  expect(d.chunks).toEqual([]);
  expect(d.outline).toEqual([]);
  expect(d.warnings).toEqual([]);
  expect(d.tokens).toEqual({});
});
