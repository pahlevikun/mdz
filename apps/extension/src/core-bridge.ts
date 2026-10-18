import { extractContent } from "../../../packages/core/src/extract";
import { buildOutline } from "../../../packages/core/src/outline";
import { buildChunks } from "../../../packages/core/src/chunk";
import { countTokensBoth } from "../../../packages/core/src/tokens";
import { emptyDoc } from "../../../packages/core/src/types";
import type { Doc } from "../../../packages/core/src/types";

export interface BridgeOptions {
  chunkBudget?: number;
  includeLinks?: boolean;
  includeImages?: boolean;
  selectionText?: string;
  selector?: string;
}

export function extractFromDocument(doc: Document, url: string, opts: BridgeOptions = {}): Doc {
  const out = emptyDoc(url);
  out.finalUrl = url;
  out.fetchedAt = new Date().toISOString();

  if (opts.selectionText) {
    out.markdown = opts.selectionText.trim();
    out.extractor = "fallback";
  } else {
    const ex = extractContent(doc, url, opts.selector);
    out.markdown = ex.markdown;
    out.title = ex.meta.title;
    out.author = ex.meta.author;
    out.published = ex.meta.published;
    out.description = ex.meta.description;
    out.siteName = ex.meta.siteName;
    out.lang = ex.meta.lang;
    out.extractor = ex.extractor;
    out.warnings = ex.warnings;
  }

  out.wordCount = out.markdown.split(/\s+/).filter(Boolean).length;
  out.charCount = out.markdown.length;
  out.tokens = countTokensBoth(out.markdown);
  out.outline = buildOutline(out.markdown);
  out.chunks = buildChunks(out.markdown, opts.chunkBudget ?? 8000);
  try { out.domain = new URL(url).hostname; } catch { /* keep "" */ }
  return out;
}
