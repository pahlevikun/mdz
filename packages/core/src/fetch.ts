const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_BYTES = 8 * 1024 * 1024;

export interface FetchResult { html: string; finalUrl: string; status: number }

export async function fetchHtml(
  url: string, opts: { timeoutMs?: number } = {}
): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain|application\/xml/.test(ct)) {
      throw new Error(`unsupported content-type: ${ct || "none"}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error(`page too large: ${buf.byteLength} bytes`);
    return { html: new TextDecoder("utf-8").decode(buf), finalUrl: res.url || url, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
