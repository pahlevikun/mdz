import { describe, expect, test } from "bun:test";
import {
  buildFrameStyle,
  frameAttributes,
  waitForLayout,
} from "../src/figma-frame";

describe("figma-frame", () => {
  test("buildFrameStyle hides off-screen and sets width", () => {
    const style = buildFrameStyle(1280);
    expect(style).toContain("left:-10000px");
    expect(style).toContain("visibility:hidden");
    expect(style).toContain("width:1280px");
  });

  test("frameAttributes is sandboxed without scripts", () => {
    const attrs = frameAttributes();
    expect(attrs).toContain('sandbox="allow-same-origin"');
    expect(attrs).toContain('aria-hidden="true"');
    expect(attrs).toContain('tabindex="-1"');
    expect(attrs).not.toContain("allow-scripts");
  });

  test("waitForLayout resolves after two rafs or times out", async () => {
    const el = {} as Element;
    const rafs: Array<() => void> = [];
    const raf = (cb: () => void) => {
      rafs.push(cb);
    };
    const p = waitForLayout(el, 100, raf, (() => 0) as never);
    expect(rafs.length).toBe(1);
    rafs[0]!();
    expect(rafs.length).toBe(2);
    rafs[1]!();
    await p;

    const timeoutFns: Array<() => void> = [];
    const p2 = waitForLayout(
      el,
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
