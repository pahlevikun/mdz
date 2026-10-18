import type { Doc } from "./types";
import { toFrontmatter } from "./frontmatter";
import { buildOutline, pageMap } from "./outline";

export interface RenderOptions {
  map?: boolean;       // default true
  chunks?: boolean;    // default false
}

export function renderMarkdown(doc: Doc, opts: RenderOptions = {}): string {
  const fm = toFrontmatter({
    title: doc.title,
    author: doc.author || undefined,
    published: doc.published || undefined,
    description: doc.description || undefined,
    url: doc.finalUrl,
    domain: doc.domain || undefined,
    site_name: doc.siteName || undefined,
    lang: doc.lang || undefined,
    words: doc.wordCount,
    chars: doc.charCount,
    tokens_o200k: doc.tokens.o200k ?? 0,
    tokens_cl100k: doc.tokens.cl100k ?? 0,
    chunks: doc.chunks.length || undefined,
    extractor: doc.extractor,
    fetched_at: doc.fetchedAt,
    generator: "mdz"
  });

  const parts: string[] = [];
  if (opts.map !== false) {
    const outline = doc.outline.length > 0 ? doc.outline : buildOutline(doc.markdown);
    const map = pageMap(outline, doc.title || "Page structure");
    if (map) parts.push("## Page map\n\n" + map);
  }
  if (opts.chunks) {
    const rows = doc.chunks.map(
      c => `- \`${c.id}\` — ${c.title} (${c.tokens} tok, lines ${c.startLine}-${c.endLine})`
    );
    if (rows.length) parts.push("## Chunks\n\n" + rows.join("\n"));
  }
  parts.push(doc.markdown);
  return fm + "\n\n" + parts.join("\n\n---\n\n") + "\n";
}

export function renderJson(doc: Doc): string {
  return JSON.stringify({
    url: doc.url,
    final_url: doc.finalUrl,
    title: doc.title,
    author: doc.author,
    published: doc.published,
    description: doc.description,
    domain: doc.domain,
    lang: doc.lang,
    words: doc.wordCount,
    chars: doc.charCount,
    tokens: doc.tokens,
    extractor: doc.extractor,
    fetched_at: doc.fetchedAt,
    warnings: doc.warnings,
    outline: doc.outline,
    chunks: doc.chunks.map(c => ({
      id: c.id, title: c.title, level: c.level, path: c.path,
      tokens: c.tokens, words: c.words, start: c.startLine, end: c.endLine
    })),
    md: doc.markdown
  }, null, 2);
}
