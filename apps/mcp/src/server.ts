#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractUrl, renderJson } from "mdz-core";
import { fetchHtml } from "../../../packages/core/src/fetch";
import type { Doc } from "mdz-core";

export interface Deps {
  http: (u: string) => Promise<{ html: string; finalUrl: string }>;
  chunk: number;
}

const cache = new Map<string, Doc>();
async function doc(url: string, d: Deps): Promise<Doc> {
  const hit = cache.get(url + "|" + d.chunk);
  if (hit) return hit;
  const v = await extractUrl(url, {
    http: d.http, chunkBudget: d.chunk, imageMode: "strip", includeImages: false
  });
  cache.set(url + "|" + d.chunk, v);
  return v;
}

export const handlers = {
  async outline(args: { url: string }, d: Deps): Promise<string> {
    const v = await doc(args.url, d);
    const rows = v.chunks.map(c => `${c.id} | ${c.tokens} tok | ${c.title}`);
    return [
      `title: ${v.title}`, `url: ${v.finalUrl}`,
      `tokens: ${v.tokens.o200k} (o200k)`, `chunks: ${v.chunks.length}`,
      "", ...rows
    ].join("\n");
  },

  async read(
    args: { url: string; chunk?: string; max_tokens?: number }, d: Deps
  ): Promise<string> {
    const v = await doc(args.url, d);
    if (args.chunk) {
      const c = v.chunks.find(x => x.id === args.chunk);
      if (!c) {
        throw new Error(`unknown chunk "${args.chunk}". valid: ${v.chunks.map(x => x.id).join(", ")}`);
      }
      return c.markdown;
    }
    const first = v.chunks[0];
    if (!first) return v.markdown;
    const rest = v.chunks.slice(1).map(c => c.id);
    const note = rest.length
      ? `\n\n<!-- more chunks available: ${rest.join(", ")} — call mdz_read with chunk=<id> -->`
      : "";
    return `<!-- chunk ${first.id} (${first.tokens} tok) -->\n${first.markdown}${note}`;
  },

  async json(args: { url: string }, d: Deps): Promise<string> {
    return renderJson(await doc(args.url, d));
  },

  async split(args: { url: string; dir?: string }, d: Deps): Promise<string> {
    const v = await doc(args.url, d);
    const dir = args.dir || join(process.cwd(), "mdz-out");
    mkdirSync(dir, { recursive: true });
    for (const c of v.chunks) writeFileSync(join(dir, `${c.id}.md`), c.markdown + "\n");
    writeFileSync(join(dir, "index.json"), renderJson(v));
    return `${v.chunks.length} chunks + index.json in ${dir}`;
  }
};

export function buildServer(deps: Deps): McpServer {
  const s = new McpServer({ name: "mdz", version: "0.1.0" });
  const url = z.string().url();
  s.tool("mdz_outline", "List a page's sections and chunk ids before reading it.",
    { url }, async (a) => ({ content: [{ type: "text", text: await handlers.outline(a, deps) }] }));
  s.tool("mdz_read", "Read a web page as LLM-ready Markdown, one chunk at a time.",
    { url, chunk: z.string().optional(), max_tokens: z.number().optional() },
    async (a) => ({ content: [{ type: "text", text: await handlers.read(a, deps) }] }));
  s.tool("mdz_json", "Full JSON manifest for a page.",
    { url }, async (a) => ({ content: [{ type: "text", text: await handlers.json(a, deps) }] }));
  s.tool("mdz_split", "Write one .md per chunk plus index.json.",
    { url, dir: z.string().optional() },
    async (a) => ({ content: [{ type: "text", text: await handlers.split(a, deps) }] }));
  return s;
}

if (import.meta.main) {
  const deps: Deps = {
    http: async (u) => fetchHtml(u, { timeoutMs: 20000 }),
    chunk: Number(process.env.MDZ_CHUNK ?? 8000)
  };
  await buildServer(deps).connect(new StdioServerTransport());
}
