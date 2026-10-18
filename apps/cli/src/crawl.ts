import { extractUrl } from "mdz-core";
import type { Doc } from "mdz-core";

export interface CrawlOptions {
  depth: number;
  max: number;
  chunk: number;
  http: (u: string) => Promise<{ html: string; finalUrl: string }>;
}

const norm = (u: string) => {
  const x = new URL(u);
  x.hash = "";
  return x.href.replace(/\/$/, "") || x.origin + "/";
};

const requestUrl = (u: string) => {
  const x = new URL(u);
  if (!x.pathname || x.pathname === "/") return x.origin + "/";
  return u;
};

export async function crawl(start: string, o: CrawlOptions): Promise<Doc[]> {
  const origin = new URL(start).origin;
  const seen = new Set<string>([norm(start)]);
  const out: Doc[] = [];
  let frontier = [norm(start)];
  const htmlCache = new Map<string, { html: string; finalUrl: string }>();

  const cacheKey = (u: string) => norm(u);

  const fetchCached = async (url: string) => {
    const key = cacheKey(url);
    const hit = htmlCache.get(key);
    if (hit) return hit;
    const r = await o.http(requestUrl(url));
    htmlCache.set(cacheKey(r.finalUrl), r);
    return r;
  };

  const cachedHttp = async (u: string) => fetchCached(u);

  for (let d = 0; d <= o.depth && frontier.length && out.length < o.max; d++) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += 2) {
      const batch = frontier.slice(i, i + 2);
      const settled = await Promise.all(batch.map(async (url) => {
        if (out.length >= o.max) return null;
        try {
          await fetchCached(url);
          const doc = await extractUrl(url, { http: cachedHttp, chunkBudget: o.chunk });
          return doc;
        } catch { return null; }
      }));
      for (const doc of settled) {
        if (!doc || out.length >= o.max) continue;
        out.push(doc);
        const html = htmlCache.get(cacheKey(doc.finalUrl))?.html ?? "";
        for (const m of html.matchAll(/href="([^"]+)"/g)) {
          let abs: string;
          try { abs = norm(new URL(m[1]!, doc.finalUrl).href); } catch { continue; }
          if (new URL(abs).origin !== origin) continue;
          if (seen.has(abs)) continue;
          seen.add(abs);
          next.push(abs);
        }
      }
    }
    frontier = next;
  }
  return out;
}
