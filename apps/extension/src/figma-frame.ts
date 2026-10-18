export interface FrameOptions {
  width: number;
  timeoutMs?: number;
}

export function buildFrameStyle(width: number): string {
  return `position:fixed; left:-10000px; top:0; width:${width}px; height:1200px; visibility:hidden; border:0;`;
}

export function frameAttributes(): string {
  return 'sandbox="allow-same-origin" aria-hidden="true" tabindex="-1"';
}

export type RafFn = (cb: () => void) => void;
export type TimerHandle = ReturnType<typeof setTimeout>;
export type TimerFn = (fn: () => void, ms: number) => TimerHandle;

export function waitForLayout(
  _el: Element,
  timeoutMs: number,
  raf: RafFn,
  timer: TimerFn = (fn, ms) => setTimeout(fn, ms),
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (err) reject(err);
      else resolve();
    };
    const t = timer(() => finish(new Error("Layout timed out")), timeoutMs);
    raf(() => {
      raf(() => finish());
    });
  });
}

export async function withLayoutFrame(
  html: string,
  url: string,
  opts: FrameOptions,
  render: (root: Element) => string | Promise<string>,
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const iframe = document.createElement("iframe");
  for (const [name, value] of [
    ["sandbox", "allow-same-origin"],
    ["aria-hidden", "true"],
    ["tabindex", "-1"],
  ] as const) {
    iframe.setAttribute(name, value);
  }
  iframe.style.cssText = buildFrameStyle(opts.width);
  document.body.appendChild(iframe);

  const dispose = () => {
    iframe.remove();
  };

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe has no document");

    const base = doc.createElement("base");
    base.href = url;
    doc.head.appendChild(base);

    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.addEventListener(
        "error",
        () => reject(new Error("iframe failed to load")),
        { once: true },
      );
      doc.open();
      doc.write(html);
      doc.close();
    });

    const root = doc.documentElement;
    await waitForLayout(root, timeoutMs, (cb) => requestAnimationFrame(cb));
    return await render(root);
  } finally {
    dispose();
  }
}
