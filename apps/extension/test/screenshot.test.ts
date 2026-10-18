import { test, expect } from "bun:test";
import { planShot, stitchFrames } from "../src/screenshot";

test("planShot on a 3.5-viewport document yields 4 frames and capped: false", () => {
  const plan = planShot({
    viewportWidth: 800,
    viewportHeight: 1000,
    docHeight: 3500,
    dpr: 1,
  });
  expect(plan.frames).toBe(4);
  expect(plan.capped).toBe(false);
  expect(plan.height).toBe(3500);
});

test("planShot on a 100 000 px document clamps to 20 000 and sets capped: true", () => {
  const plan = planShot({
    viewportWidth: 800,
    viewportHeight: 1000,
    docHeight: 100_000,
    dpr: 1,
  });
  expect(plan.height).toBe(20_000);
  expect(plan.capped).toBe(true);
});

function fakeCanvas(draws: unknown[]) {
  return {
    createCanvas(w: number, h: number) {
      return {
        width: w,
        height: h,
        getContext() {
          return {
            drawImage(...args: unknown[]) {
              draws.push(args);
            },
          };
        },
        toDataURL() {
          return "data:image/png;base64,AA==";
        },
      };
    },
    decode(dataUrl: string) {
      const m = /base64,(\w+)/.exec(dataUrl);
      const id = m?.[1] ?? "unknown";
      return Promise.resolve({ id, width: 1600, height: 2000 });
    },
  };
}

test("stitchFrames with 3 solid-colour frames and a fake canvas records three drawImage calls with the right destination y for each", async () => {
  const plan = planShot({
    viewportWidth: 800,
    viewportHeight: 1000,
    docHeight: 3000,
    dpr: 2,
  });
  const draws: unknown[] = [];
  const deps = fakeCanvas(draws);
  await stitchFrames(
    plan,
    [
      { dataUrl: "data:image/png;base64,red", cssTop: 0 },
      { dataUrl: "data:image/png;base64,green", cssTop: 1000 },
      { dataUrl: "data:image/png;base64,blue", cssTop: 2000 },
    ],
    deps,
  );
  expect(draws).toHaveLength(3);
  expect(draws[0]).toEqual([{ id: "red", width: 1600, height: 2000 }, 0, 0, 1600, 2000, 0, 0, 1600, 2000]);
  expect(draws[1]).toEqual([{ id: "green", width: 1600, height: 2000 }, 0, 0, 1600, 2000, 0, 2000, 1600, 2000]);
  expect(draws[2]).toEqual([{ id: "blue", width: 1600, height: 2000 }, 0, 0, 1600, 2000, 0, 4000, 1600, 2000]);
});

test("stitchFrames with a short final frame draws it with a source rect, not the full height", async () => {
  const plan: import("../src/screenshot").ShotPlan = {
    width: 800,
    height: 2500,
    dpr: 2,
    frames: 3,
    frameHeight: 1000,
    capped: false,
  };
  const draws: unknown[] = [];
  const deps = fakeCanvas(draws);
  await stitchFrames(
    plan,
    [
      { dataUrl: "data:image/png;base64,a", cssTop: 0 },
      { dataUrl: "data:image/png;base64,b", cssTop: 1000 },
      { dataUrl: "data:image/png;base64,c", cssTop: 2000 },
    ],
    deps,
  );
  const last = draws[2] as number[];
  expect(last[3]).toBe(1600);
  expect(last[4]).toBe(1000);
  expect(last[8]).toBe(1000);
});

test("stitchFrames rejects when decode fails for one frame and names the frame index", async () => {
  const plan = planShot({
    viewportWidth: 800,
    viewportHeight: 1000,
    docHeight: 3000,
    dpr: 1,
  });
  const draws: unknown[] = [];
  const deps = {
    ...fakeCanvas(draws),
    decode(dataUrl: string) {
      if (dataUrl.includes("green")) return Promise.reject(new Error("bad bitmap"));
      return fakeCanvas(draws).decode(dataUrl);
    },
  };
  await expect(
    stitchFrames(
      plan,
      [
        { dataUrl: "data:image/png;base64,red", cssTop: 0 },
        { dataUrl: "data:image/png;base64,green", cssTop: 1000 },
        { dataUrl: "data:image/png;base64,blue", cssTop: 2000 },
      ],
      deps,
    ),
  ).rejects.toThrow(/1/);
});

test("stitchFrames calls close on each decoded bitmap exactly once after drawing", async () => {
  const plan = planShot({
    viewportWidth: 800,
    viewportHeight: 1000,
    docHeight: 2000,
    dpr: 1,
  });
  const draws: unknown[] = [];
  const closeCounts = new Map<string, number>();
  const deps = {
    createCanvas: fakeCanvas(draws).createCanvas,
    decode(dataUrl: string) {
      const m = /base64,(\w+)/.exec(dataUrl);
      const id = m?.[1] ?? "unknown";
      return Promise.resolve({
        id,
        width: 800,
        height: 1000,
        close() {
          closeCounts.set(id, (closeCounts.get(id) ?? 0) + 1);
        },
      });
    },
  };
  await stitchFrames(
    plan,
    [
      { dataUrl: "data:image/png;base64,red", cssTop: 0 },
      { dataUrl: "data:image/png;base64,green", cssTop: 1000 },
    ],
    deps,
  );
  expect(closeCounts.get("red")).toBe(1);
  expect(closeCounts.get("green")).toBe(1);
});
