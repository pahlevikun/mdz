import type { Doc, OutlineNode } from "./types";

export interface TreePage {
  url: string;
  title: string;
  depth: number;
  parent: string | null;
  tokens: { o200k: number; cl100k: number };
  chunks: string[];
  outline: OutlineNode[];
}

export interface TreeEdge {
  from: string;
  to: string;
  anchor: string;
}

export interface SiteTree {
  root: string;
  generated_at: string;
  pages: TreePage[];
  edges: TreeEdge[];
  stats: { pages: number; edges: number; total_o200k: number; max_depth: number };
  warnings: string[];
}

export interface BuildSiteTreeOptions {
  maxPages?: number;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function trimAnchor(anchor: string): string {
  const t = anchor.trim();
  return t.length > 80 ? t.slice(0, 80) : t;
}

function docTokens(doc: Doc): { o200k: number; cl100k: number } {
  return {
    o200k: doc.tokens.o200k ?? 0,
    cl100k: doc.tokens.cl100k ?? 0,
  };
}

export function buildSiteTree(
  root: string,
  docs: Doc[],
  links: { from: string; to: string; anchor: string }[],
  options: BuildSiteTreeOptions = {},
): SiteTree {
  const maxPages = options.maxPages ?? 500;
  const warnings: string[] = [];
  const rootHost = hostOf(root);

  const seenFinal = new Set<string>();
  const deduped: Doc[] = [];
  for (const doc of docs) {
    const fu = doc.finalUrl;
    if (seenFinal.has(fu)) {
      warnings.push(`duplicate finalUrl dropped: ${fu}`);
      continue;
    }
    seenFinal.add(fu);
    deduped.push(doc);
  }

  let offHostDropped = 0;
  const onHost: Doc[] = [];
  for (const doc of deduped) {
    const h = hostOf(doc.finalUrl);
    if (rootHost === null || h !== rootHost) {
      offHostDropped++;
      continue;
    }
    onHost.push(doc);
  }
  if (offHostDropped > 0) {
    warnings.push(`dropped ${offHostDropped} page(s) outside host ${rootHost ?? ""}`);
  }

  const kept: Doc[] = [];
  let maxPagesDropped = 0;
  for (const doc of onHost) {
    if (kept.length >= maxPages) {
      maxPagesDropped++;
      continue;
    }
    kept.push(doc);
  }
  if (maxPagesDropped > 0) {
    warnings.push(`maxPages ${maxPages}: dropped ${maxPagesDropped} page(s)`);
  }

  const pageUrls = new Set(kept.map((d) => d.finalUrl));

  let treeRoot = root;
  if (!pageUrls.has(treeRoot)) {
    const match = kept.find((d) => d.finalUrl === root || d.url === root);
    if (match) treeRoot = match.finalUrl;
  }

  const edgeList: TreeEdge[] = [];
  const edgeKey = new Set<string>();
  let offTreeEdges = 0;
  for (const link of links) {
    const { from, to } = link;
    if (from === to) continue;
    const fromIn = pageUrls.has(from);
    const toIn = pageUrls.has(to);
    if (!fromIn || !toIn) {
      if (fromIn || toIn) offTreeEdges++;
      continue;
    }
    const key = `${from}\0${to}`;
    if (edgeKey.has(key)) continue;
    edgeKey.add(key);
    edgeList.push({ from, to, anchor: trimAnchor(link.anchor) });
  }
  if (offTreeEdges > 0) {
    warnings.push(`dropped ${offTreeEdges} edge(s) pointing outside the tree`);
  }

  const children = new Map<string, string[]>();
  for (const e of edgeList) {
    const list = children.get(e.from) ?? [];
    list.push(e.to);
    children.set(e.from, list);
  }

  const depth = new Map<string, number>();
  const parent = new Map<string, string | null>();

  if (pageUrls.has(treeRoot)) {
    depth.set(treeRoot, 0);
    parent.set(treeRoot, null);
    const queue = [treeRoot];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!;
      const dFrom = depth.get(from)!;
      for (const to of children.get(from) ?? []) {
        const nd = dFrom + 1;
        if (!depth.has(to)) {
          depth.set(to, nd);
          parent.set(to, from);
          queue.push(to);
        } else if (nd < depth.get(to)!) {
          depth.set(to, nd);
          parent.set(to, from);
        }
      }
    }
  }

  for (const url of pageUrls) {
    if (url === treeRoot) continue;
    if (depth.has(url)) continue;

    let offTreeParent = false;
    for (const link of links) {
      if (link.to !== url) continue;
      if (!pageUrls.has(link.from)) offTreeParent = true;
    }
    if (offTreeParent) {
      warnings.push(`page ${url} has parent not in docs`);
    }
    depth.set(url, 1);
    parent.set(url, null);
  }

  const pages: TreePage[] = kept.map((doc) => {
    const url = doc.finalUrl;
    const d = depth.get(url) ?? (url === treeRoot ? 0 : 1);
    const p = url === treeRoot ? null : (parent.get(url) ?? null);
    return {
      url,
      title: doc.title,
      depth: d,
      parent: p,
      tokens: docTokens(doc),
      chunks: doc.chunks.map((c) => c.id),
      outline: doc.outline,
    };
  });

  pages.sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.url.localeCompare(b.url)));
  edgeList.sort((a, b) =>
    a.from !== b.from ? a.from.localeCompare(b.from) : a.to.localeCompare(b.to),
  );

  const total_o200k = pages.reduce((s, p) => s + p.tokens.o200k, 0);
  const max_depth = pages.reduce((m, p) => Math.max(m, p.depth), 0);

  return {
    root: treeRoot,
    generated_at: new Date().toISOString(),
    pages,
    edges: edgeList,
    stats: {
      pages: pages.length,
      edges: edgeList.length,
      total_o200k,
      max_depth,
    },
    warnings,
  };
}

export function renderSiteTree(tree: SiteTree): string {
  return JSON.stringify(tree, null, 2);
}
