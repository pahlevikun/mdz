import { test, expect } from "bun:test";
import { buildSiteTree, renderSiteTree } from "../src/site-tree";
import { emptyDoc } from "../src/types";
import type { Doc } from "../src/types";

function doc(finalUrl: string, extra: Partial<Doc> = {}): Doc {
  return { ...emptyDoc(finalUrl), finalUrl, url: finalUrl, ...extra };
}

test("dedupes by finalUrl with a warning", () => {
  const root = "https://example.com/";
  const docs = [
    doc("https://example.com/a", { title: "first" }),
    doc("https://example.com/a", { title: "second" }),
  ];
  const tree = buildSiteTree(root, docs, []);
  expect(tree.pages).toHaveLength(1);
  expect(tree.pages[0]!.title).toBe("first");
  expect(tree.warnings.some((w) => w.includes("duplicate"))).toBe(true);
});

test("drops off-host docs with count warning", () => {
  const root = "https://example.com/";
  const docs = [
    doc("https://example.com/"),
    doc("https://other.com/page"),
  ];
  const tree = buildSiteTree(root, docs, []);
  expect(tree.pages).toHaveLength(1);
  expect(tree.warnings.some((w) => w.includes("1") && w.includes("outside host"))).toBe(true);
});

test("shallowest depth and missing parent warning", () => {
  const root = "https://example.com/";
  const a = "https://example.com/a";
  const b = "https://example.com/b";
  const c = "https://example.com/c";
  const docs = [doc(root), doc(a), doc(b), doc(c)];
  const links = [
    { from: root, to: a, anchor: "a" },
    { from: a, to: c, anchor: "deep" },
    { from: root, to: b, anchor: "b" },
    { from: b, to: c, anchor: "short" },
    { from: "https://example.com/missing", to: c, anchor: "x" },
  ];
  const tree = buildSiteTree(root, docs, links);
  const pageC = tree.pages.find((p) => p.url === c)!;
  expect(pageC.depth).toBe(2);
  expect(pageC.parent).not.toBeNull();
  expect([a, b]).toContain(pageC.parent!);
  const orphan = "https://example.com/orphan";
  const tree2 = buildSiteTree(root, [...docs, doc(orphan)], [
    { from: "https://example.com/ghost", to: orphan, anchor: "go" },
  ]);
  const pageO = tree2.pages.find((p) => p.url === orphan)!;
  expect(pageO.parent).toBeNull();
  expect(pageO.depth).toBe(1);
  expect(tree2.warnings.some((w) => w.includes("not in docs"))).toBe(true);
});

test("edges dedupe, drop self-links and off-tree targets", () => {
  const root = "https://example.com/";
  const a = "https://example.com/a";
  const docs = [doc(root), doc(a)];
  const links = [
    { from: root, to: a, anchor: " first " },
    { from: root, to: a, anchor: "dup" },
    { from: a, to: a, anchor: "self" },
    { from: root, to: "https://example.com/nope", anchor: "off" },
  ];
  const tree = buildSiteTree(root, docs, links);
  expect(tree.edges).toHaveLength(1);
  expect(tree.edges[0]!.anchor).toBe("first");
  expect(tree.warnings.some((w) => w.includes("outside the tree"))).toBe(true);
});

test("deterministic JSON aside from generated_at", () => {
  const root = "https://example.com/";
  const docs = [doc(root), doc("https://example.com/z"), doc("https://example.com/a")];
  const links = [
    { from: root, to: "https://example.com/a", anchor: "a" },
    { from: root, to: "https://example.com/z", anchor: "z" },
  ];
  const norm = (s: string) =>
    JSON.parse(s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at":""'));
  const t1 = norm(renderSiteTree(buildSiteTree(root, docs, links)));
  const t2 = norm(renderSiteTree(buildSiteTree(root, docs, links)));
  expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
});

test("maxPages keeps first N and warns dropped count", () => {
  const root = "https://example.com/";
  const docs = [
    doc("https://example.com/1"),
    doc("https://example.com/2"),
    doc("https://example.com/3"),
  ];
  const tree = buildSiteTree(root, docs, [], { maxPages: 2 });
  expect(tree.pages).toHaveLength(2);
  expect(tree.warnings.some((w) => w.includes("dropped 1"))).toBe(true);
});
