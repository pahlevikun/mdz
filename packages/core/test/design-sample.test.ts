import { test, expect } from "bun:test";
import { sampleStyles } from "../src/design-sample";

test("duplicate text color usage aggregates", () => {
  const set = sampleStyles(".a{color:#2f6feb}.b{color:#2f6feb}");
  expect(set.colors).toHaveLength(1);
  expect(set.colors[0]?.color).toBe("#2f6feb");
  expect(set.colors[0]?.usage).toBe(2);
  expect(set.colors[0]?.role).toBe("text");
});

test("background and border roles", () => {
  const set = sampleStyles(
    "body{background:#16181d} .x{border:1px solid #3a3f47}",
  );
  const bg = set.colors.find((c) => c.color === "#16181d");
  const border = set.colors.find((c) => c.color === "#3a3f47");
  expect(bg?.role).toBe("background");
  expect(border?.role).toBe("border");
});

test("font group in one rule yields one body sample", () => {
  const set = sampleStyles(
    "p{font-family:Inter;font-size:16px;font-weight:400;line-height:1.5}",
  );
  expect(set.fonts).toHaveLength(1);
  expect(set.fonts[0]).toMatchObject({
    family: "Inter",
    size: "16px",
    weight: 400,
    lineHeight: "1.5",
    heading: false,
  });
});

test("h1 selector marks heading font sample", () => {
  const set = sampleStyles(
    "h1{font-family:Inter;font-size:24px;font-weight:600;line-height:1.2}",
  );
  expect(set.fonts[0]?.heading).toBe(true);
});

test("padding and border-radius contribute spacing and radii", () => {
  const set = sampleStyles(".box{padding:8px 16px;border-radius:6px}");
  expect(set.spacings).toEqual(["8px", "16px"]);
  expect(set.radii).toEqual(["6px"]);
});
