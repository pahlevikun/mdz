export interface FrameOptions {
  width: number;
  timeoutMs?: number;
}

export function buildFrameStyle(width: number): string {
  return `position:fixed; left:-10000px; top:0; width:${width}px; height:1200px; visibility:hidden; border:0;`;
}

export function frameAttributes(): readonly (readonly [string, string])[] {
  return [
    ["sandbox", "allow-same-origin"],
    ["aria-hidden", "true"],
    ["tabindex", "-1"],
  ] as const;
}

export function hasScriptPermission(
  attrs: readonly (readonly [string, string])[],
): boolean {
  return attrs.some(([n, v]) => n === "sandbox" && v.includes("allow-scripts"));
}

export function withBaseTag(html: string, url: string): string {
  if (/<base\b/i.test(html)) return html;
  const escaped = url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const tag = `<base href="${escaped}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
  if (/<html[^>]*>/i.test(html))
    return html.replace(/<html[^>]*>/i, (m) => m + `<head>${tag}</head>`);
  return `<head>${tag}</head>` + html;
}

export type RafFn = (cb: () => void) => void;
export type TimerHandle = ReturnType<typeof setTimeout>;
export type TimerFn = (fn: () => void, ms: number) => TimerHandle;

export function waitForLayout(
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
  const attrs = frameAttributes();
  if (hasScriptPermission(attrs))
    throw new Error("refusing to build an iframe that can run page scripts");
  for (const [name, value] of attrs) iframe.setAttribute(name, value);
  iframe.style.cssText = buildFrameStyle(opts.width);
  document.body.appendChild(iframe);

  const dispose = () => {
    iframe.remove();
  };

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe has no document");

    const htmlWithBase = withBaseTag(html, url);

    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.addEventListener(
        "error",
        () => reject(new Error("iframe failed to load")),
        { once: true },
      );
      doc.open();
      doc.write(htmlWithBase);
      doc.close();
    });

    const root = doc.documentElement;
    await waitForLayout(timeoutMs, (cb) => requestAnimationFrame(cb));
    return await render(root);
  } finally {
    dispose();
  }
}
