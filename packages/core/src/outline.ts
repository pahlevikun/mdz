import type { OutlineNode } from "./types";

const FENCE = /^\s*(```|~~~)/;

export function slugify(s: string): string {
  const out = s.toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return out || "section";
}

export function buildOutline(markdown: string): OutlineNode[] {
  const root: OutlineNode = { level: 0, title: "", slug: "", children: [] };
  const stack: OutlineNode[] = [root];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const node: OutlineNode = {
      level: m[1]!.length,
      title: m[2]!.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim(),
      slug: slugify(m[2]!),
      children: []
    };
    while (stack.length > 1 && stack[stack.length - 1]!.level >= node.level) stack.pop();
    stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return root.children;
}

export function pageMap(outline: OutlineNode[], title: string): string {
  if (outline.length === 0) return "";
  let body = "";
  const walk = (nodes: OutlineNode[], prefix: string) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      body += `${prefix}${last ? "└── " : "├── "}${n.title}\n`;
      walk(n.children, prefix + (last ? "    " : "│   "));
    });
  };
  walk(outline, "");
  return "```text\n" + title + "\n" + body.trimEnd() + "\n```";
}
