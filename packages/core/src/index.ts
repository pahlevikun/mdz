import { fetchHtml } from "./fetch";
import { loadDocument } from "./dom";
import { extractContent } from "./extract";
import { buildOutline } from "./outline";
import { buildChunks } from "./chunk";
import { countTokensBoth } from "./tokens";
import { DEFAULT_OPTIONS, emptyDoc } from "./types";
import type { Doc, ExtractOptions } from "./types";

export * from "./types";
export { renderMarkdown, renderJson } from "./render";
export { buildChunks } from "./chunk";
export { buildOutline } from "./outline";
export { countTokens, countTokensBoth } from "./tokens";
export { deriveTokens, toDesignMd, normalizeColor } from "./design-tokens";
export type {
  ColorSample,
  FontSample,
  SampleSet,
  TokenDraft,
} from "./design-tokens";
export { htmlToMarkdown } from "./extract";

const IMG = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /(?<!!)\[([^\]]*)\]\([^)]*\)/g;

export async function extractUrl(url: string, opts: ExtractOptions = {}): Promise<Doc> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const doc = emptyDoc(url);
  const got = opts.http
    ? await opts.http(url)
    : await fetchHtml(url, { timeoutMs: o.timeoutMs });
  doc.finalUrl = got.finalUrl;

  const dom = loadDocument(got.html, got.finalUrl);

  const ex = extractContent(dom, got.finalUrl, opts.selector);
  let md = ex.markdown;
  if (o.imageMode === "strip" && !o.includeImages) md = md.replace(IMG, "");
  if (!o.includeLinks) md = md.replace(LINK, "$1");
  md = md.replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  Object.assign(doc, {
    title: ex.meta.title,
    author: ex.meta.author,
    published: ex.meta.published,
    description: ex.meta.description,
    siteName: ex.meta.siteName,
    favicon: ex.meta.favicon,
    lang: ex.meta.lang,
    extractor: ex.extractor,
    warnings: ex.warnings,
    markdown: md,
    wordCount: md.split(/\s+/).filter(Boolean).length,
    charCount: md.length,
    tokens: countTokensBoth(md),
    outline: buildOutline(md),
    chunks: buildChunks(md, o.chunkBudget, o.model),
    fetchedAt: new Date().toISOString()
  });
  try { doc.domain = new URL(doc.finalUrl).hostname; } catch { /* keep "" */ }
  return doc;
}
