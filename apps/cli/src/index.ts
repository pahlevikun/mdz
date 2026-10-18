#!/usr/bin/env node
import { writeFileSync as wf, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractUrl, renderJson, renderMarkdown } from "mdz-core";
import { fetchHtml } from "../../../packages/core/src/fetch";
import { parseArgs } from "./args";
import { crawl } from "./crawl";

export interface Deps {
  http: (u: string) => Promise<{ html: string; finalUrl: string }>;
  stdout: (s: string) => void;
  writeFile: (path: string, content: string) => void;
  mkdir: (dir: string) => void;
}

export async function run(argv: string[], deps: Deps): Promise<number> {
  let o;
  try { o = parseArgs(argv); } catch (e) {
    deps.stdout(`mdz: ${(e as Error).message}\n`);
    return 2;
  }
  if (o.url === "--help") {
    deps.stdout(HELP + "\n");
    return 0;
  }
  if (o.url === "--version") {
    deps.stdout(VERSION + "\n");
    return 0;
  }

  if (o.crawl > 0) {
    const docs = await crawl(o.url, { depth: o.crawl, max: 20, chunk: o.chunk, http: deps.http });
    const dir = o.split || ".";
    deps.mkdir(dir);
    docs.forEach((d, i) => {
      const name = `${String(i + 1).padStart(2, "0")}-${(d.domain || "page").replace(/\W+/g, "-")}.json`;
      deps.writeFile(join(dir, name), renderJson(d));
    });
    if (!o.quiet) deps.stdout(`crawled ${docs.length} pages into ${dir}\n`);
    return 0;
  }

  const doc = await extractUrl(o.url, {
    http: deps.http,
    chunkBudget: o.chunk,
    model: o.model,
    includeLinks: o.links,
    includeImages: o.images,
    imageMode: o.images ? "keep" : "strip",
    selector: o.selector || undefined
  });

  if (o.split) {
    deps.mkdir(o.split);
    for (const c of doc.chunks) {
      deps.writeFile(join(o.split, `${c.id}.md`), c.markdown + "\n");
    }
    deps.writeFile(join(o.split, "index.json"), renderJson(doc));
    if (!o.quiet) deps.stdout(`wrote ${doc.chunks.length} chunks to ${o.split}\n`);
    return 0;
  }

  if (o.out) {
    deps.writeFile(o.out, renderMarkdown(doc, { map: o.map }));
    if (!o.quiet) deps.stdout(`wrote ${o.out}\n`);
  }
  if (o.jsonOut) deps.writeFile(o.jsonOut, renderJson(doc));

  if (!o.out) {
    deps.stdout(o.json ? renderJson(doc) : renderMarkdown(doc, { map: o.map }));
  }
  return 0;
}

const VERSION = "0.1.0";

const HELP = `mdz — any web page to LLM-ready Markdown

  mdz <url> [options]

  --json               print JSON manifest
  --out <file.md>      write markdown to a file
  --json-out <file>    write JSON manifest alongside
  --chunk <n>          token budget per chunk (default 8000)
  --split <dir>        one .md per chunk + index.json
  --no-map             omit the page map
  --map                force the page map on
  --no-links           strip links
  --images             keep image tags
  --model <p>          o200k | cl100k | approx
  --selector <css>     extract only this element
  --crawl <depth>      follow same-site links up to depth, writes one JSON per page
  --version            print the version
  --quiet              no progress lines`;

if (import.meta.main) {
  const code = await run(process.argv.slice(2), {
    http: async (u) => fetchHtml(u, { timeoutMs: 20000 }),
    stdout: (s) => process.stdout.write(s),
    writeFile: (p, c) => wf(p, c),
    mkdir: (d) => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
  });
  process.exit(code);
}
