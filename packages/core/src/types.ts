export type ModelProfile = "o200k" | "cl100k" | "approx";

export interface OutlineNode {
  level: number;          // 1..6, 0 for the synthetic root
  title: string;
  slug: string;
  children: OutlineNode[];
}

export interface Chunk {
  id: string;             // stable slug, unique per document, e.g. "02-install"
  title: string;
  level: number;
  path: string[];         // ancestor titles, root first
  tokens: number;
  words: number;
  startLine: number;      // 1-based, into doc.markdown
  endLine: number;
  markdown: string;
}

export interface Doc {
  url: string;            // as requested
  finalUrl: string;       // after redirects
  title: string;
  author: string;
  published: string;      // ISO date or ""
  description: string;
  siteName: string;
  domain: string;
  favicon: string;
  lang: string;
  wordCount: number;
  charCount: number;
  tokens: Record<string, number>;   // { o200k: n, cl100k: n }
  markdown: string;       // body only, NO frontmatter
  outline: OutlineNode[];
  chunks: Chunk[];
  fetchedAt: string;      // ISO, frontmatter/JSON only
  extractor: "defuddle" | "fallback";
  warnings: string[];
}

export interface ExtractOptions {
  model?: ModelProfile;
  chunkBudget?: number;   // tokens per chunk, default 8000
  includeImages?: boolean;   // default false
  includeLinks?: boolean;    // default true
  imageMode?: "keep" | "strip";  // default "strip"
  selector?: string;      // CSS selector: extract only this subtree
  http?: (url: string) => Promise<{ html: string; finalUrl: string }>;
  timeoutMs?: number;     // default 20000
}

export const DEFAULT_OPTIONS: Required<Pick<ExtractOptions,
  "model" | "chunkBudget" | "includeImages" | "includeLinks" | "imageMode" | "timeoutMs">> = {
  model: "o200k",
  chunkBudget: 8000,
  includeImages: false,
  includeLinks: true,
  imageMode: "strip",
  timeoutMs: 20000
};

export function emptyDoc(url: string): Doc {
  return {
    url, finalUrl: url, title: "", author: "", published: "", description: "",
    siteName: "", domain: "", favicon: "", lang: "",
    wordCount: 0, charCount: 0, tokens: {},
    markdown: "", outline: [], chunks: [],
    fetchedAt: "", extractor: "defuddle", warnings: []
  };
}
