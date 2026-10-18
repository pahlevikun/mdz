export interface ShotPlan {
  width: number;
  height: number;
  dpr: number;
  frames: number;
  frameHeight: number;
  capped: boolean;
}

export interface StitchDeps {
  createCanvas?(w: number, h: number): any;
  decode?(dataUrl: string): Promise<any>;
}

const MAX_PX = 20000;
const MAX_FRAMES = 40;

const defaultCreateCanvas = (w: number, h: number) => new OffscreenCanvas(w, h);
const defaultDecode = async (u: string) =>
  createImageBitmap(await (await fetch(u)).blob());

export function planShot(input: {
  viewportWidth: number;
  viewportHeight: number;
  docHeight: number;
  dpr: number;
}): ShotPlan {
  const { viewportWidth, viewportHeight, docHeight, dpr } = input;
  const frameHeight = viewportHeight;
  let capped = false;
  let height = docHeight;
  if (height > MAX_PX) {
    height = MAX_PX;
    capped = true;
  }
  let frames = Math.max(1, Math.ceil(height / frameHeight));
  if (frames > MAX_FRAMES) {
    frames = MAX_FRAMES;
    height = Math.min(height, MAX_FRAMES * frameHeight);
    capped = true;
  }
  return {
    width: viewportWidth,
    height,
    dpr,
    frames,
    frameHeight,
    capped,
  };
}

export async function stitchFrames(
  plan: ShotPlan,
  frames: { dataUrl: string; cssTop: number }[],
  deps: StitchDeps = {},
): Promise<string> {
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const decode = deps.decode ?? defaultDecode;
  const w = Math.round(plan.width * plan.dpr);
  const h = Math.round(plan.height * plan.dpr);
  const surface = createCanvas(w, h);
  const ctx = surface.getContext("2d") as CanvasRenderingContext2D;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const cssRemaining = plan.height - frame.cssTop;
    const sliceCss = Math.min(plan.frameHeight, cssRemaining);
    const destY = Math.round(frame.cssTop * plan.dpr);
    const drawH = Math.round(sliceCss * plan.dpr);
    let img: { width: number; height: number; close?: () => void };
    try {
      img = await decode(frame.dataUrl);
    } catch {
      throw new Error(`Failed to decode screenshot frame at index ${i}`);
    }
    const srcW = img.width;
    const srcH = drawH;
    ctx.drawImage(img as CanvasImageSource, 0, 0, srcW, srcH, 0, destY, srcW, drawH);
    img.close?.();
  }

  if (typeof surface.convertToBlob === "function") {
    const blob = await surface.convertToBlob({ type: "image/png" });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return `data:image/png;base64,${btoa(binary)}`;
  }
  return surface.toDataURL("image/png");
}
