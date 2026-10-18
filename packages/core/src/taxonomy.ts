import type { OutlineNode } from "./types";

export interface TaxonomyGuess {
  kind: string;
  confidence: number;
  signals: string[];
}

export interface Taxonomy {
  roots: string[];
  by_url: Record<string, TaxonomyGuess>;
  generated_at: string;
  warnings: string[];
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function pathSegments(url: string): string[] {
  return pathnameOf(url).split("/").filter(Boolean);
}

function hasQueryParam(url: string, name: string): boolean {
  try {
    return new URL(url).searchParams.has(name);
  } catch {
    return false;
  }
}

function countOutlineNodes(nodes: OutlineNode[]): number {
  let n = 0;
  const walk = (list: OutlineNode[]) => {
    for (const node of list) {
      n++;
      walk(node.children);
    }
  };
  walk(nodes);
  return n;
}

function h1Titles(outline: OutlineNode[]): string[] {
  const titles: string[] = [];
  const walk = (nodes: OutlineNode[]) => {
    for (const node of nodes) {
      if (node.level === 1) titles.push(node.title);
      walk(node.children);
    }
  };
  walk(outline);
  return titles;
}

function hasDateLikeSegment(segments: string[]): boolean {
  for (const seg of segments) {
    if (/^\d{4}-\d{2}$/.test(seg)) return true;
  }
  for (let i = 0; i < segments.length - 1; i++) {
    if (/^\d{4}$/.test(segments[i]!) && /^\d{2}$/.test(segments[i + 1]!)) return true;
  }
  return false;
}

function segmentHas(segments: string[], words: string[]): boolean {
  return segments.some((s) => words.includes(s));
}

const H1_VOCAB: Record<string, RegExp[]> = {
  pricing: [/^pricing$/i],
  legal: [/^privacy policy$/i],
  changelog: [/^changelog$/i],
  docs: [/^documentation$/i],
  "blog-post": [/^blog$/i],
};

function applyH1Boost(kind: string, confidence: number, outline: OutlineNode[]): number {
  const patterns = H1_VOCAB[kind];
  if (!patterns) return confidence;
  const titles = h1Titles(outline);
  for (const title of titles) {
    for (const re of patterns) {
      if (re.test(title.trim())) return Math.min(0.95, confidence + 0.1);
    }
  }
  return confidence;
}

export function classifyPage(url: string, outline: OutlineNode[], _text: string): TaxonomyGuess {
  const segments = pathSegments(url);
  const path = pathnameOf(url);

  const finish = (kind: string, confidence: number, signals: string[]): TaxonomyGuess => ({
    kind,
    confidence: applyH1Boost(kind, confidence, outline),
    signals,
  });

  if (segmentHas(segments, ["pricing", "plans", "price"])) {
    return finish("pricing", 0.9, ["path contains pricing/plans/price"]);
  }
  if (segmentHas(segments, ["privacy", "terms", "legal", "tos", "cookie"])) {
    return finish("legal", 0.9, ["path contains privacy/terms/legal/tos/cookie"]);
  }
  if (segmentHas(segments, ["changelog", "releases", "release-notes"])) {
    return finish("changelog", 0.85, ["path contains changelog/releases/release-notes"]);
  }
  if (
    segmentHas(segments, ["blog", "posts", "news"]) &&
    hasDateLikeSegment(segments)
  ) {
    return finish("blog-post", 0.8, ["path contains blog/posts/news with date-like segment"]);
  }
  if (segmentHas(segments, ["docs", "documentation", "guide", "reference", "api"])) {
    return finish("docs", 0.8, ["path contains docs/documentation/guide/reference/api"]);
  }
  if (segmentHas(segments, ["about", "team", "company", "contact"])) {
    return finish("about", 0.75, ["path contains about/team/company/contact"]);
  }
  if (
    segmentHas(segments, ["search", "query", "results"]) ||
    hasQueryParam(url, "q")
  ) {
    return finish("search", 0.7, ["path contains search/query/results or q= param"]);
  }

  const isRootPath = path === "/" || path === "";
  if (isRootPath || (countOutlineNodes(outline) < 8 && segments.length === 1)) {
    return finish("landing", 0.5, [
      isRootPath ? "root path" : "fewer than 8 outline nodes and path length 1",
    ]);
  }

  if (segmentHas(segments, ["blog", "posts"])) {
    return finish("blog-post", 0.55, ["path contains blog/posts without date"]);
  }

  return { kind: "unknown", confidence: 0, signals: ["no matching rule"] };
}

export function buildTaxonomy(
  _root: string,
  pages: { url: string; outline: OutlineNode[]; text: string }[],
): Taxonomy {
  const by_url: Record<string, TaxonomyGuess> = {};
  for (const p of pages) {
    by_url[p.url] = classifyPage(p.url, p.outline, p.text);
  }

  const rootSet = new Set<string>();
  for (const p of pages) {
    const guess = by_url[p.url]!;
    if (guess.kind === "docs" || guess.kind === "blog-post") {
      const seg = pathSegments(p.url)[0];
      if (seg) rootSet.add(seg);
    }
  }
  const roots = [...rootSet].sort();

  return {
    roots,
    by_url,
    generated_at: new Date().toISOString(),
    warnings: [],
  };
}

export function applyOverrides(t: Taxonomy, overrides: Record<string, string>): Taxonomy {
  const by_url = { ...t.by_url };
  for (const [url, kind] of Object.entries(overrides)) {
    by_url[url] = {
      kind,
      confidence: 1,
      signals: ["overridden by config"],
    };
  }
  return {
    roots: t.roots,
    by_url,
    generated_at: t.generated_at,
    warnings: t.warnings,
  };
}
