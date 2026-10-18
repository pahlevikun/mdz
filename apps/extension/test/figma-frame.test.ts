import { describe, expect, test } from "bun:test";
import {
  buildFrameStyle,
  frameAttributes,
  hasScriptPermission,
  waitForLayout,
  withBaseTag,
} from "../src/figma-frame";

describe("figma-frame", () => {
  test("buildFrameStyle hides off-screen and sets width", () => {
    const style = buildFrameStyle(1280);
    expect(style).toContain("left:-10000px");
    expect(style).toContain("visibility:hidden");
    expect(style).toContain("width:1280px");
  });

  test("frameAttributes returns sandboxed attribute pairs", () => {
    const attrs = frameAttributes();
    expect(attrs).toEqual([
      ["sandbox", "allow-same-origin"],
      ["aria-hidden", "true"],
      ["tabindex", "-1"],
    ]);
    const sandbox = attrs.find(([name]) => name === "sandbox");
    expect(sandbox?.[1]).not.toContain("allow-scripts");
  });

  test("hasScriptPermission is false for frameAttributes()", () => {
    expect(hasScriptPermission(frameAttributes())).toBe(false);
  });

  test("hasScriptPermission detects allow-scripts in sandbox value", () => {
    expect(
      hasScriptPermission([["sandbox", "allow-same-origin allow-scripts"]]),
    ).toBe(true);
  });

  test("withBaseTag inserts base immediately after head", () => {
    const out = withBaseTag("<head><title>x</title></head><body></body>", "https://a/b");
    expect(out).toMatch(/^<head><base href="https:\/\/a\/b"><title>/);
  });

  test("withBaseTag adds head when html has html but no head", () => {
    const out = withBaseTag("<html><body>hi</body></html>", "https://x/");
    expect(out).toBe('<html><head><base href="https://x/"></head><body>hi</body></html>');
  });

  test("withBaseTag prefixes head for bare fragment", () => {
    const out = withBaseTag("<div>frag</div>", "https://frag/");
    expect(out).toBe('<head><base href="https://frag/"></head><div>frag</div>');
  });

  test("withBaseTag escapes &, quote and < in url", () => {
    const url = 'https://a/?q=1&x="y"<z>';
    const out = withBaseTag("<head></head>", url);
    expect(out).toBe(
      '<head><base href="https://a/?q=1&amp;x=&quot;y&quot;&lt;z>"></head>',
    );
  });

  test("withBaseTag does not add second base when one exists", () => {
    const html = '<head><base href="https://first/"></head><body></body>';
    expect(withBaseTag(html, "https://second/")).toBe(html);
  });

  test("waitForLayout resolves after two rafs or times out", async () => {
    const rafs: Array<() => void> = [];
    const raf = (cb: () => void) => {
      rafs.push(cb);
    };
    const p = waitForLayout(100, raf, (() => 0) as never);
    expect(rafs.length).toBe(1);
    rafs[0]!();
    expect(rafs.length).toBe(2);
    rafs[1]!();
    await p;

    const timeoutFns: Array<() => void> = [];
    const p2 = waitForLayout(
      100,
      () => {},
      ((fn: () => void, _ms: number) => {
        timeoutFns.push(fn);
        return 0;
      }) as never,
    );
    expect(timeoutFns.length).toBe(1);
    timeoutFns[0]!();
    await expect(p2).rejects.toThrow("Layout timed out");
  });
});
