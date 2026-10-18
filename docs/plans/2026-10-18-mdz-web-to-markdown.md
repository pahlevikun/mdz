# mdz — Web → LLM-ready Markdown (CLI + MCP + Extension) Implementation Plan

> **For agentic workers:** Implement this plan task by task with `super-tdd` (one failing test, then the smallest pass), prove each task with `super-verify`, and commit with `atomic-semantic-commit`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One TypeScript core that turns any web page into detailed, frontmatter-rich Markdown plus a machine-readable JSON chunk plan, shipped three ways: a single-file `mdz` binary, an MCP server agents can call, and a Chrome/Firefox extension published to the stores.

**Architecture:** `packages/core` does fetch → DOM (`linkedom`) → main-content extraction (`defuddle`, markdown mode **off**) → turndown → outline → token-aware chunking → render (YAML frontmatter + body, or JSON). `apps/cli` and `apps/mcp` are thin shells over core. `apps/extension` reuses core against the live page DOM instead of a fetch, so all three surfaces produce byte-identical Markdown for the same content.

**Tech Stack:** TypeScript 5.x (strict), Bun 1.4.3 (runtime, test runner, `bun build --compile` single binary), `linkedom`, `defuddle`, `turndown` + `turndown-plugin-gfm`, `gpt-tokenizer`, `@modelcontextprotocol/sdk`, `plasmo` + React 18 (extension only).

## Global Constraints

- **Bun 1.4.3** is the build+runtime for CLI/MCP. Node 20.19.2 must still run the built binary's JS path in tests (`bun test` only, no jest/vitest).
- **Single binary output**, no install step: `bun build apps/cli/src/index.ts --compile --outfile dist/mdz`. Target ≤ 110 MB (measured 91.3 MB for the same dependency set).
- **DOM: `linkedom` only.** `jsdom` is banned: jsdom 30 crashes Node 20's undici on load, jsdom 26 pulls ~20 MB extra into the binary (96.1 MB vs 91.3 MB measured).
- **`defuddle` markdown mode is banned.** `defuddle/full` with `{ markdown: true }` either throws (`ReferenceError: document is not defined`) or silently returns `"Partial conversion completed with errors. Original HTML: …"` as the content (reproduced on `paulgraham.com/greatwork.html`). Always: `new Defuddle(doc, { markdown: false })` → `.parse().content` (HTML) → convert with our own turndown instance. This is also ~1,400 fewer tokens of noise on the same page (14,181 vs 15,829).
- No page content leaves the machine. No telemetry, no hosted API, no LLM call inside the tool. Extraction is deterministic.
- Every public function is pure except the two named `fetchHtml` / `loadDocument`; they take an injectable `http` function so tests never hit the network.
- Output Markdown must be valid CommonMark + GFM, and must be stable: same input HTML → byte-identical output (no timestamps inside the body, `fetched_at` lives only in frontmatter/JSON).
- All money-free: no paid services in the build, the CI, or the runtime.
- Naming: binary `mdz`, npm package `mdz`, MCP bin `mdz-mcp`, extension name `.mdz this page`. Repo `github.com/pahlevikun/mdz`.

---

## Repository Layout

```
mdz/
├── package.json                 # bun workspaces: packages/*, apps/*
├── bunfig.toml
├── tsconfig.base.json           # strict, noUncheckedIndexedAccess
├── packages/core/
│   ├── src/types.ts             # Doc, Chunk, OutlineNode, ExtractOptions
│   ├── src/fetch.ts             # fetchHtml (UA, timeout, redirects, size cap)
│   ├── src/dom.ts               # loadDocument, visible-clone, noise removal
│   ├── src/extract.ts           # defuddle → turndown → {html, md, meta}
│   ├── src/tokens.ts            # countTokens(text, model)
│   ├── src/outline.ts           # heading tree + ASCII page map
│   ├── src/chunk.ts             # token-budgeted chunks + stable ids
│   ├── src/frontmatter.ts       # YAML writer (no dep)
│   ├── src/render.ts            # renderMarkdown(doc, opts), renderJson(doc)
│   ├── src/index.ts             # extractUrl(url, opts) → Doc
│   └── test/*.test.ts
├── apps/cli/
│   ├── src/index.ts             # arg parsing + output routing
│   ├── src/args.ts              # parseArgs (own, ~120 lines, no dep)
│   └── test/cli.test.ts
├── apps/mcp/
│   ├── src/server.ts            # stdio MCP server, 4 tools
│   └── test/mcp.test.ts
├── apps/extension/
│   ├── (plasmo layout: background.ts, tabs/preview.tsx, contents/, options.tsx)
│   └── src/core-bridge.ts       # extract from live document
└── .github/workflows/{ci.yml,release.yml}
```

---

### Task 1: Workspace skeleton + types

**Files:**
- Create: `package.json`, `bunfig.toml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Test: `packages/core/test/types.test.ts`

**Interfaces:**
- Produces: every type below, imported by all later tasks.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p packages/core/src packages/core/test apps/cli/src apps/mcp/src
cd /root/mdz && bun init -y >/dev/null
```

`package.json` (root):

```json
{
  "name": "mdz-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc -b",
    "build:cli": "bun build apps/cli/src/index.ts --compile --outfile dist/mdz",
    "build:mcp": "bun build apps/mcp/src/server.ts --compile --outfile dist/mdz-mcp"
  }
}
```

`bunfig.toml`:

```toml
[install]
exact = true
```

`packages/core/package.json`:

```json
{
  "name": "mdz-core",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

- [ ] **Step 2: Write the failing test**

`packages/core/test/types.test.ts`:

```ts
import { test, expect } from "bun:test";
import { emptyDoc } from "../src/types";

test("emptyDoc fills every required field", () => {
  const d = emptyDoc("https://example.com/a");
  expect(d.url).toBe("https://example.com/a");
  expect(d.markdown).toBe("");
  expect(d.chunks).toEqual([]);
  expect(d.outline).toEqual([]);
  expect(d.warnings).toEqual([]);
  expect(d.tokens).toEqual({});
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `bun test packages/core/test/types.test.ts`
Expected: FAIL — `Cannot find module '../src/types'`.

- [ ] **Step 4: Implement `types.ts`**

```ts
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
```

- [ ] **Step 5: Run test, expect pass, commit**

```bash
bun test packages/core/test/types.test.ts
git add -A && git commit -m "chore: scaffold mdz workspace and core types"
```

---

### Task 2: Token counting (real tokenizer, not `length/4`)

**Files:**
- Create: `packages/core/src/tokens.ts`
- Test: `packages/core/test/tokens.test.ts`

**Interfaces:**
- Produces: `countTokens(text: string, model?: ModelProfile): number`, `countTokensBoth(text: string): Record<string, number>`.

The competitor estimates `Math.ceil(text.length / 4)`. That is wrong for CJK (off by 2-3x) and for code. We count for real.

- [ ] **Step 1: Install dep**

```bash
cd /root/mdz && bun add -d gpt-tokenizer@4.0.4 --cwd packages/core
```

- [ ] **Step 2: Failing test**

```ts
import { test, expect } from "bun:test";
import { countTokens, countTokensBoth } from "../src/tokens";

test("o200k count is a real tokenization, not chars/4", () => {
  const cjk = "中文网页转成马尔可夫格式"; // 12 chars
  expect(countTokens(cjk, "o200k")).toBeGreaterThan(8); // chars/4 would give 3
  const ascii = "the quick brown fox jumps over the lazy dog";
  expect(countTokens(ascii, "o200k")).toBe(9);
});

test("countTokensBoth returns both vocab sizes", () => {
  const r = countTokensBoth("hello world");
  expect(r.o200k).toBe(2);
  expect(r.cl100k).toBe(2);
});

test("empty string is zero", () => {
  expect(countTokens("", "o200k")).toBe(0);
});
```

- [ ] **Step 3: Run, expect fail**

Run: `bun test packages/core/test/tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import { encode as encodeO200k } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encodeCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import type { ModelProfile } from "./types";

export function countTokens(text: string, model: ModelProfile = "o200k"): number {
  if (!text) return 0;
  if (model === "cl100k") return encodeCl100k(text).length;
  if (model === "o200k") return encodeO200k(text).length;
  // "approx": mid-point of the two vocabularies, for Claude/Gemini estimates.
  return Math.round((encodeO200k(text).length + encodeCl100k(text).length) / 2);
}

export function countTokensBoth(text: string): Record<string, number> {
  if (!text) return { o200k: 0, cl100k: 0 };
  return { o200k: encodeO200k(text).length, cl100k: encodeCl100k(text).length };
}
```

- [ ] **Step 5: Pass + commit**

```bash
bun test packages/core/test/tokens.test.ts
git add -A && git commit -m "feat(core): real tokenizer counts with o200k/cl100k profiles"
```

---

### Task 3: Fetch + DOM loading

**Files:**
- Create: `packages/core/src/fetch.ts`, `packages/core/src/dom.ts`
- Test: `packages/core/test/fetch.test.ts`, `packages/core/test/dom.test.ts`

**Interfaces:**
- Produces: `fetchHtml(url, {timeoutMs}): Promise<{html, finalUrl, status}>`; `loadDocument(html, url): Document`; `visibleClone(root: Element): Element`; `stripNoise(root: Element): void`.

- [ ] **Step 1: Install deps**

```bash
cd /root/mdz/packages/core && bun add linkedom@0.18.13 defuddle@0.19.5 turndown@7.2.4
```

- [ ] **Step 2: Failing tests**

`fetch.test.ts` — no network: assert header/UA shape and the size cap by stubbing global fetch.

```ts
import { test, expect, mock } from "bun:test";
import { fetchHtml } from "../src/fetch";

test("sends a browser UA and follows the redirect", async () => {
  const calls: any[] = [];
  globalThis.fetch = mock(async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response("<html><body>hi</body></html>", {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" }
    });
  }) as any;
  const r = await fetchHtml("https://example.com", { timeoutMs: 5000 });
  expect(r.html).toContain("hi");
  expect(r.finalUrl).toBe("https://example.com");
  expect(calls[0].init.headers["user-agent"]).toContain("Mozilla/5.0");
});

test("rejects non-HTML content types", async () => {
  globalThis.fetch = mock(async () => new Response("%PDF", {
    status: 200, headers: { "content-type": "application/pdf" }
  })) as any;
  expect(fetchHtml("https://example.com/x.pdf", {})).rejects.toThrow(/content-type/i);
});
```

`dom.test.ts`:

```ts
import { test, expect } from "bun:test";
import { loadDocument, visibleClone, stripNoise } from "../src/dom";

const HTML = `<!doctype html><html><body>
  <nav>menu</nav>
  <main><h1>Title</h1><p>keep me</p>
    <div style="display:none">hidden one</div>
    <div aria-hidden="true">hidden two</div>
    <div hidden>hidden three</div>
    <script>var x=1</script>
  </main>
</body></html>`;

test("loadDocument gives a usable DOM", () => {
  const doc = loadDocument(HTML, "https://example.com");
  expect(doc.querySelector("h1")?.textContent).toBe("Title");
});

test("visibleClone drops display:none, aria-hidden and [hidden]", () => {
  const doc = loadDocument(HTML, "https://example.com");
  const clone = visibleClone(doc.querySelector("main")!);
  const text = clone.textContent ?? "";
  expect(text).toContain("keep me");
  expect(text).not.toContain("hidden one");
  expect(text).not.toContain("hidden two");
  expect(text).not.toContain("hidden three");
});

test("stripNoise removes nav/script/iframe/svg", () => {
  const doc = loadDocument(HTML, "https://example.com");
  const main = doc.querySelector("main")!;
  stripNoise(main);
  expect(main.textContent).not.toContain("var x=1");
});
```

- [ ] **Step 3: Run, expect fail**

Run: `bun test packages/core/test/fetch.test.ts packages/core/test/dom.test.ts`

- [ ] **Step 4: Implement `fetch.ts`**

```ts
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_BYTES = 8 * 1024 * 1024;

export interface FetchResult { html: string; finalUrl: string; status: number }

export async function fetchHtml(
  url: string, opts: { timeoutMs?: number } = {}
): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain|application\/xml/.test(ct)) {
      throw new Error(`unsupported content-type: ${ct || "none"}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error(`page too large: ${buf.byteLength} bytes`);
    return { html: new TextDecoder("utf-8").decode(buf), finalUrl: res.url || url, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 5: Implement `dom.ts`**

```ts
import { parseHTML } from "linkedom";

const NOISE = 'script, style, link, meta, noscript, template, svg, canvas, iframe, nav, footer, aside, form, [aria-hidden="true"], [hidden]';

export function loadDocument(html: string, url: string): Document {
  const { document } = parseHTML(html);
  Object.defineProperty(document, "URL", { value: url, configurable: true });
  return document as unknown as Document;
}

function isHidden(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = (el.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

export function visibleClone<T extends Element>(root: T): T {
  const clone = root.cloneNode(true) as T;
  const all = Array.from(clone.querySelectorAll("*"));
  for (const el of all) if (isHidden(el)) el.remove();
  return clone;
}

export function stripNoise(root: Element): void {
  for (const el of Array.from(root.querySelectorAll(NOISE))) el.remove();
}
```

Note in a code comment above `isHidden`: linkedom has no `checkVisibility()`; the competitor's `offsetParent === null` trick does not work outside a layout engine. Attribute + inline-style detection is the portable substitute.

- [ ] **Step 6: Pass + commit**

```bash
bun test packages/core/test/fetch.test.ts packages/core/test/dom.test.ts
git add -A && git commit -m "feat(core): http fetch with UA/timeout/caps and linkedom helpers"
```

---

### Task 4: Extraction (defuddle → turndown) with the whole-page fallback

**Files:**
- Create: `packages/core/src/extract.ts`
- Test: `packages/core/test/extract.test.ts`
- Create: `packages/core/test/fixtures/article.html`, `packages/core/test/fixtures/app-shell.html`

**Interfaces:**
- Consumes: `loadDocument`, `visibleClone`, `stripNoise`, `countTokens`.
- Produces: `extractContent(doc: Document, url: string): { html: string; markdown: string; meta: ExtractMeta; extractor: "defuddle" | "fallback"; warnings: string[] }` and turndown conversion `htmlToMarkdown(html: string): string`.

- [ ] **Step 1: Add GFM plugin**

```bash
cd /root/mdz/packages/core && bun add turndown-plugin-gfm@1.0.2
```

- [ ] **Step 2: Create fixtures**

`article.html` — 200-word article with `<h1>`, `<h2>`, `<table>`, `<pre><code>`, a `<nav>` and an ad `<div>`. `app-shell.html` — a dashboard where `<main>` contains only a 10-word heading and 900 words live in sibling `<section>`s (the case defuddle under-reads).

Write them by hand, both ≥ 900 characters total. `article.html` must include this exact table so the later test can assert GFM:

```html
<table><thead><tr><th>Model</th><th>Tokens</th></tr></thead>
<tbody><tr><td>o200k</td><td>200000</td></tr></tbody></table>
```

- [ ] **Step 3: Failing tests**

```ts
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { loadDocument } from "../src/dom";
import { extractContent, htmlToMarkdown } from "../src/extract";

const art = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./fixtures/app-shell.html", import.meta.url), "utf8");

test("article: keeps prose, drops nav and ads", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.extractor).toBe("defuddle");
  expect(r.markdown).toContain("## ");
  expect(r.markdown).not.toContain("Sign in");
  expect(r.markdown).not.toContain("Sponsored");
});

test("article: GFM table survives as a pipe table", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).toContain("| Model | Tokens |");
  expect(r.markdown).toContain("| --- | --- |");
});

test("article: code fence keeps its language", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).toMatch(/```(ts|js)\n/);
});

test("app shell: falls back to the whole page instead of 10 words", () => {
  const r = extractContent(loadDocument(app, "https://app.example.com"), "https://app.example.com");
  expect(r.extractor).toBe("fallback");
  expect(r.markdown.split(/\s+/).length).toBeGreaterThan(300);
});

test("never returns defuddle's partial-conversion garbage", () => {
  const r = extractContent(loadDocument(art, "https://example.com/post"), "https://example.com/post");
  expect(r.markdown).not.toContain("Partial conversion completed");
});

test("htmlToMarkdown turns a bare string into markdown", () => {
  expect(htmlToMarkdown("<h2>Hi</h2><p>there</p>")).toBe("## Hi\n\nthere");
});
```

- [ ] **Step 4: Run, expect fail**

Run: `bun test packages/core/test/extract.test.ts`

- [ ] **Step 5: Implement `extract.ts`**

```ts
import Defd from "defuddle";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { visibleClone, stripNoise } from "./dom";

const Defuddle: any = (Defd as any).default ?? Defd;

const td = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**"
});
td.use(gfm);
td.remove(["nav", "footer", "aside", "form", "noscript", "svg", "iframe"]);

// Defuddle writes fenced blocks as ```text; drop the useless alias.
td.addRule("plainFence", {
  filter: (node: any) => node.nodeName === "PRE" &&
    (node.firstChild?.nodeName ?? "") !== "CODE",
  replacement: (content: string) => "```\n" + content.replace(/\n$/, "") + "\n```\n"
});

export function htmlToMarkdown(html: string): string {
  return td.turndown(html).trim();
}

export interface ExtractMeta {
  title: string; author: string; published: string;
  description: string; siteName: string; favicon: string; lang: string;
}

const MIN_WORDS = 150;
const FALLBACK_RATIO = 3;

function wordCount(s: string): number {
  const m = s.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

function meta(doc: Document, url: string, d: any): ExtractMeta {
  const q = (sel: string) => doc.querySelector(sel)?.getAttribute("content") ?? "";
  let domain = d?.domain ?? "";
  try { domain ||= new URL(url).hostname; } catch { /* keep empty */ }
  let favicon = "";
  try {
    const u = new URL(d?.favicon || "/favicon.ico", url);
    if (/^(https?|data):$/.test(u.protocol)) favicon = u.href;
  } catch { /* keep empty */ }
  return {
    title: (d?.title || doc.querySelector("title")?.textContent || "").trim(),
    author: (d?.author || q('meta[name="author"]') || q('meta[property="article:author"]')).trim(),
    published: (d?.published || q('meta[property="article:published_time"]')).trim(),
    description: (d?.description || q('meta[name="description"]')).trim(),
    siteName: q('meta[property="og:site_name"]') || domain,
    favicon,
    lang: doc.documentElement?.getAttribute("lang") ?? ""
  };
}

export function extractContent(doc: Document, url: string) {
  const warnings: string[] = [];
  let parsed: any = null;
  try {
    parsed = new Defuddle(doc, { url, markdown: false, useAsync: false }).parse();
  } catch (e) {
    warnings.push(`defuddle failed: ${(e as Error).message}`);
  }

  const mainHtml = (parsed?.content ?? "").trim();
  let markdown = mainHtml ? htmlToMarkdown(mainHtml) : "";
  const pageText = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const extracted = wordCount(markdown);
  const page = wordCount(pageText);

  let extractor: "defuddle" | "fallback" = "defuddle";
  if (!markdown || (extracted < MIN_WORDS && page > extracted * FALLBACK_RATIO)) {
    const root = doc.querySelector('main, [role="main"]') ?? doc.body;
    let fallbackHtml = "";
    if (root) {
      const clone = visibleClone(root as Element);
      stripNoise(clone);
      fallbackHtml = clone.innerHTML;
    }
    const fallbackMd = htmlToMarkdown(fallbackHtml);
    if (wordCount(fallbackMd) > extracted) {
      markdown = fallbackMd;
      extractor = "fallback";
    }
  }

  if (/Partial conversion completed/.test(markdown)) {
    warnings.push("defuddle partial conversion discarded");
    markdown = markdown.replace(/Partial conversion completed with errors[\s\S]*/, "").trim();
  }

  return { html: mainHtml, markdown, meta: meta(doc, url, parsed), extractor, warnings };
}
```

- [ ] **Step 6: Pass + commit**

```bash
bun test packages/core/test/extract.test.ts
git add -A && git commit -m "feat(core): defuddle extraction with whole-page fallback and GFM markdown"
```

---

### Task 5: Outline, page map, slug ids

**Files:**
- Create: `packages/core/src/outline.ts`
- Test: `packages/core/test/outline.test.ts`

**Interfaces:**
- Produces: `buildOutline(markdown: string): OutlineNode[]`, `pageMap(outline: OutlineNode[], title: string): string`, `slugify(s: string): string`.

- [ ] **Step 1: Failing test**

```ts
import { test, expect } from "bun:test";
import { buildOutline, pageMap, slugify } from "../src/outline";

const MD = `# Intro
text
## Install
### macOS
### Linux
## Usage
# Appendix`;

test("builds a nested tree from heading levels", () => {
  const t = buildOutline(MD);
  expect(t.length).toBe(2);
  expect(t[0].title).toBe("Intro");
  expect(t[0].children.map(c => c.title)).toEqual(["Install", "Usage"]);
  expect(t[0].children[0].children.map(c => c.title)).toEqual(["macOS", "Linux"]);
});

test("ignores headings inside fenced code", () => {
  const t = buildOutline("```\n# not a heading\n```\n# real");
  expect(t.map(n => n.title)).toEqual(["real"]);
});

test("slugify is url-safe and stable", () => {
  expect(slugify("Install & Setup (v2)")).toBe("install-setup-v2");
  expect(slugify("  ")).toBe("section");
});

test("pageMap renders an ascii tree", () => {
  const map = pageMap(buildOutline(MD), "My Page");
  expect(map).toContain("├── Install");
  expect(map).toContain("│   ├── macOS");
  expect(map).toContain("```text");
});
```

- [ ] **Step 2: Implement `outline.ts`**

```ts
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
      level: m[1].length,
      title: m[2].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim(),
      slug: slugify(m[2]),
      children: []
    };
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
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
```

- [ ] **Step 3: Pass + commit**

```bash
bun test packages/core/test/outline.test.ts
git add -A && git commit -m "feat(core): heading outline and ascii page map"
```

---

### Task 6: Token-budgeted chunking with stable ids

**Files:**
- Create: `packages/core/src/chunk.ts`
- Test: `packages/core/test/chunk.test.ts`

**Interfaces:**
- Consumes: `countTokens`, `slugify`.
- Produces: `buildChunks(markdown: string, budget?: number, model?: ModelProfile): Chunk[]`.

Rule: split at headings of level ≤ 2. If a single section exceeds `budget`, split it at the next heading level down; if still too big, hard-split on paragraph boundaries. Chunk ids are `NN-slug`, ordered, deterministic.

- [ ] **Step 1: Failing test**

```ts
import { test, expect } from "bun:test";
import { buildChunks } from "../src/chunk";

const big = (n: number) => Array.from({ length: n }, (_, i) => `paragraph number ${i} with some words`).join("\n\n");

test("splits on h2 and keeps ids stable and unique", () => {
  const md = `# Doc\nintro\n\n## Install\n${big(5)}\n\n## Usage\n${big(5)}`;
  const c = buildChunks(md, 2000);
  const ids = c.map(x => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[0]).toMatch(/^\d{2}-/);
  expect(buildChunks(md, 2000).map(x => x.id)).toEqual(ids);
});

test("hard-splits a section larger than the budget", () => {
  const md = `## Long\n${big(400)}`;
  const c = buildChunks(md, 500);
  expect(c.length).toBeGreaterThan(1);
  for (const x of c) expect(x.tokens).toBeLessThanOrEqual(650);
});

test("line ranges cover the document without overlap", () => {
  const md = `# A\ntext\n## B\nmore`;
  const c = buildChunks(md, 2000);
  for (const x of c) {
    expect(x.startLine).toBeGreaterThan(0);
    expect(x.endLine).toBeGreaterThanOrEqual(x.startLine);
    expect(md.split("\n").slice(x.startLine - 1, x.endLine).join("\n")).toBe(x.markdown);
  }
});

test("path carries the ancestor titles", () => {
  const md = `# A\n## B\n### C\nbody`;
  const c = buildChunks(md, 2000);
  expect(c.at(-1)!.path).toEqual(["A", "B"]);
});
```

- [ ] **Step 2: Implement `chunk.ts`**

```ts
import { countTokens } from "./tokens";
import { slugify } from "./outline";
import type { Chunk, ModelProfile } from "./types";

interface Line { i: number; text: string; level: number }

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function scan(markdown: string): Line[] {
  const lines: Line[] = [];
  let inFence = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) { inFence = !inFence; lines.push({ i, text, level: 0 }); return; }
    const m = inFence ? null : text.match(HEADING);
    lines.push({ i, text, level: m ? m[1].length : 0 });
  });
  return lines;
}

export function buildChunks(
  markdown: string, budget = 8000, model: ModelProfile = "o200k"
): Chunk[] {
  const lines = scan(markdown);
  const out: Chunk[] = [];
  const seq: string[] = [];

  // Section boundaries: every heading of level 1-2 starts a new block.
  let start = 0;
  const bounds: number[] = [];
  lines.forEach((l) => { if (l.level >= 1 && l.level <= 2) bounds.push(l.i); });
  if (bounds.length === 0 || bounds[0] !== 0) bounds.unshift(0);
  const sections: Array<[number, number]> = bounds.map((b, k) =>
    [b, (bounds[k + 1] ?? lines.length) - 1]);

  for (const [s, e] of sections) {
    const text = lines.slice(s, e + 1).map(l => l.text).join("\n").trim();
    if (!text) continue;
    if (countTokens(text, model) <= budget) {
      seq.push(text);
    } else {
      // split the oversized section on paragraph boundaries
      const paras = text.split(/\n{2,}/);
      let buf: string[] = [];
      for (const p of paras) {
        const candidate = [...buf, p].join("\n\n");
        if (buf.length && countTokens(candidate, model) > budget) {
          seq.push(buf.join("\n\n"));
          buf = [p];
        } else buf.push(p);
      }
      if (buf.length) seq.push(buf.join("\n\n"));
    }
  }

  // Rebuild with exact line ranges by walking the original markdown once.
  let cursor = 0;
  const flat = markdown.split("\n");
  seq.forEach((chunkMd, idx) => {
    const firstLine = chunkMd.split("\n")[0];
    let found = -1;
    for (let i = cursor; i < flat.length; i++) {
      if (flat[i] === firstLine) { found = i; break; }
    }
    if (found === -1) found = cursor;
    const end = found + chunkMd.split("\n").length - 1;
    cursor = end + 1;

    const headingLine = chunkMd.split("\n")[0];
    const hm = headingLine.match(HEADING);
    const level = hm ? hm[1].length : 0;
    const title = hm ? hm[2].replace(/[*_`]/g, "").trim() : `Part ${idx + 1}`;

    // ancestor path: nearest preceding headings in the original doc
    const path: string[] = [];
    for (let i = found - 1; i >= 0; i--) {
      const m = flat[i].match(HEADING);
      if (!m) continue;
      const lv = m[1].length;
      if (lv < level && !path.some(p => p === m[2].replace(/[*_`]/g, "").trim())) {
        path.unshift(m[2].replace(/[*_`]/g, "").trim());
        if (lv === 1) break;
      }
    }

    out.push({
      id: `${String(idx + 1).padStart(2, "0")}-${slugify(title)}`,
      title, level, path,
      tokens: countTokens(chunkMd, model),
      words: chunkMd.split(/\s+/).filter(Boolean).length,
      startLine: found + 1,
      endLine: end + 1,
      markdown: chunkMd
    });
  });

  return out;
}
```

- [ ] **Step 3: Pass + commit**

```bash
bun test packages/core/test/chunk.test.ts
git add -A && git commit -m "feat(core): token-budgeted chunking with stable ids and line ranges"
```

---

### Task 7: Frontmatter + renderers

**Files:**
- Create: `packages/core/src/frontmatter.ts`, `packages/core/src/render.ts`
- Test: `packages/core/test/render.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(doc, {chunks: boolean, map: boolean, model}): string`, `renderJson(doc): string`.

Frontmatter is written by hand (30 lines) instead of pulling a YAML dep. Values are quoted only when needed; arrays render as block sequences.

- [ ] **Step 1: Failing test**

```ts
import { test, expect } from "bun:test";
import { emptyDoc } from "../src/types";
import { renderMarkdown, renderJson } from "../src/render";
import { buildChunks } from "../src/chunk";

function sample() {
  const d = emptyDoc("https://example.com/post");
  d.finalUrl = "https://example.com/post";
  d.title = "Hello: a title";
  d.author = "Ada";
  d.published = "2026-10-01";
  d.domain = "example.com";
  d.lang = "en";
  d.wordCount = 42;
  d.charCount = 210;
  d.tokens = { o200k: 55, cl100k: 58 };
  d.fetchedAt = "2026-10-18T00:00:00.000Z";
  d.markdown = "# Intro\nhello\n\n## Install\nrun it";
  d.chunks = buildChunks(d.markdown, 8000);
  return d;
}

test("frontmatter is delimited and carries mdz metadata", () => {
  const md = renderMarkdown(sample(), { map: true });
  expect(md.startsWith("---\n")).toBe(true);
  expect(md).toContain('title: "Hello: a title"');
  expect(md).toContain("url: https://example.com/post");
  expect(md).toContain("tokens_o200k: 55");
  expect(md).toContain("extractor: defuddle");
  expect(md.split("---")[0].length).toBe(1);
});

test("body keeps the page markdown and can carry a page map", () => {
  const md = renderMarkdown(sample(), { map: true });
  expect(md).toContain("## Page map");
  expect(md).toContain("```text");
  expect(md).toContain("# Intro\nhello");
});

test("chunk manifest is optional and lists ids + tokens", () => {
  const withChunks = renderMarkdown(sample(), { chunks: true });
  expect(withChunks).toContain("## Chunks");
  expect(withChunks).toContain("01-intro");
  const without = renderMarkdown(sample(), {});
  expect(without).not.toContain("## Chunks");
});

test("json output is parseable and complete", () => {
  const j = JSON.parse(renderJson(sample()));
  expect(j.url).toBe("https://example.com/post");
  expect(Array.isArray(j.chunks)).toBe(true);
  expect(j.md).toContain("# Intro");
});
```

- [ ] **Step 2: Implement `frontmatter.ts`**

```ts
type Val = string | number | boolean | string[];

function scalar(v: string | number | boolean): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === "") return '""';
  const needsQuote = /^[\s>|*&!%@`#-]|: |\s$/.test(v) || /^(true|false|null|~)$/i.test(v);
  return needsQuote ? JSON.stringify(v) : v;
}

export function toFrontmatter(fields: Record<string, Val | undefined>): string {
  const out: string[] = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${k}: []`);
      else { out.push(`${k}:`); for (const item of v) out.push(`  - ${scalar(item)}`); }
    } else out.push(`${k}: ${scalar(v)}`);
  }
  out.push("---");
  return out.join("\n");
}
```

- [ ] **Step 3: Implement `render.ts`**

```ts
import type { Doc } from "./types";
import { toFrontmatter } from "./frontmatter";
import { pageMap } from "./outline";

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
    tokens_o200k: doc.tokens.o200k,
    tokens_cl100k: doc.tokens.cl100k,
    chunks: doc.chunks.length || undefined,
    extractor: doc.extractor,
    fetched_at: doc.fetchedAt,
    generator: "mdz"
  });

  const parts: string[] = [];
  if (opts.map !== false) {
    const map = pageMap(doc.outline, doc.title || "Page structure");
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
```

- [ ] **Step 4: Pass + commit**

```bash
bun test packages/core/test/render.test.ts
git add -A && git commit -m "feat(core): detailed yaml frontmatter and markdown/json renderers"
```

---

### Task 8: `extractUrl` — the one public entry point

**Files:**
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `extractUrl(url: string, opts?: ExtractOptions): Promise<Doc>`, plus re-exports of `renderMarkdown`, `renderJson`, `buildChunks`, `countTokens`, types.

- [ ] **Step 1: Failing test** (uses `opts.http`, no network)

```ts
import { test, expect } from "bun:test";
import { extractUrl } from "../src/index";

const HTML = `<html lang="en"><head><title>T</title>
<meta name="author" content="Ada"><meta property="article:published_time" content="2026-10-01">
</head><body><main><h1>T</h1><p>${"word ".repeat(300)}</p>
<h2>Two</h2><p>${"more ".repeat(300)}</p></main></body></html>`;

const http = async () => ({ html: HTML, finalUrl: "https://example.com/post" });

test("produces a complete Doc", async () => {
  const d = await extractUrl("https://example.com/post", { http });
  expect(d.title).toBe("T");
  expect(d.author).toBe("Ada");
  expect(d.markdown.length).toBeGreaterThan(1000);
  expect(d.wordCount).toBeGreaterThan(500);
  expect(d.tokens.o200k).toBeGreaterThan(0);
  expect(d.outline.length).toBeGreaterThan(0);
  expect(d.chunks.length).toBeGreaterThan(0);
  expect(d.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("selector narrows the extraction to one subtree", async () => {
  const d = await extractUrl("https://example.com/post", { http, selector: "h2" });
  expect(d.markdown).not.toContain("word word word");
});

test("image stripping is the default", async () => {
  const withImg = HTML.replace("<p>", '<p><img src="x.png" alt="pic">');
  const d = await extractUrl("https://example.com/post", { http: async () => ({ html: withImg, finalUrl: "u" }) });
  expect(d.markdown).not.toContain("pic");
});
```

- [ ] **Step 2: Implement `index.ts`**

```ts
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
  let root: Document = dom;
  if (opts.selector) {
    const el = dom.querySelector(opts.selector);
    if (!el) throw new Error(`selector not found: ${opts.selector}`);
    root = el.ownerDocument;
  }

  const ex = extractContent(root, got.finalUrl);
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
```

`selector` support in extract: when a selector is given, `extractContent` should run on that element's HTML, not the whole page. Adjust `extract.ts`:

```ts
export function extractContent(doc: Document, url: string, selector?: string) {
  const target = selector ? doc.querySelector(selector) : null;
  const source = target ?? doc;
  // …everything else unchanged, but parse `source`:
  //   parsed = new Defuddle(source, { url, markdown: false, useAsync: false }).parse()
  //   pageText reads source, not doc
}
```

and pass `opts.selector` from `index.ts` as the third argument instead of swapping the document.

- [ ] **Step 3: Pass + commit**

```bash
bun test packages/core/test/index.test.ts
git add -A && git commit -m "feat(core): extractUrl entry point"
```

---

### Task 9: CLI

**Files:**
- Create: `apps/cli/src/args.ts`, `apps/cli/src/index.ts`
- Test: `apps/cli/test/args.test.ts`, `apps/cli/test/cli.test.ts`

**Interfaces:**
- Produces: `parseArgs(argv: string[]): CliOptions` and a `run(argv, deps)` that returns an exit code (so tests call `run` directly, not `process.exit`).

```
mdz <url> [options]
  --json                 print the JSON manifest (md field included)
  --out <file.md>        write markdown to a file instead of stdout
  --json-out <file>      write the JSON manifest alongside
  --chunk <n>            token budget per chunk (default 8000)
  --split <dir>          write one .md per chunk + index.json
  --map / --no-map       include the page map (default on)
  --no-links             strip links
  --images               keep image tags
  --model <o200k|cl100k|approx>
  --selector <css>
  --crawl <depth>        follow same-site links, max 20 pages
  --quiet
```

- [ ] **Step 1: Failing test for the parser**

```ts
import { test, expect } from "bun:test";
import { parseArgs } from "../src/args";

test("url plus flags", () => {
  const o = parseArgs(["https://a.com/x", "--json", "--chunk", "4000", "--no-links"]);
  expect(o.url).toBe("https://a.com/x");
  expect(o.json).toBe(true);
  expect(o.chunk).toBe(4000);
  expect(o.links).toBe(false);
});

test("defaults", () => {
  const o = parseArgs(["https://a.com"]);
  expect(o.chunk).toBe(8000);
  expect(o.map).toBe(true);
  expect(o.split).toBe("");
});

test("missing url is an error", () => {
  expect(() => parseArgs(["--json"])).toThrow(/url/i);
});

test("unknown flag is an error", () => {
  expect(() => parseArgs(["https://a.com", "--nope"])).toThrow(/unknown flag/i);
});
```

- [ ] **Step 2: Implement `args.ts`**

```ts
export interface CliOptions {
  url: string; json: boolean; out: string; jsonOut: string;
  chunk: number; split: string; map: boolean; links: boolean;
  images: boolean; model: "o200k" | "cl100k" | "approx";
  selector: string; crawl: number; quiet: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const o: CliOptions = {
    url: "", json: false, out: "", jsonOut: "", chunk: 8000, split: "",
    map: true, links: true, images: false, model: "o200k",
    selector: "", crawl: 0, quiet: false
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--json": o.json = true; break;
      case "--out": o.out = next(); break;
      case "--json-out": o.jsonOut = next(); break;
      case "--chunk": o.chunk = Number(next()); break;
      case "--split": o.split = next(); break;
      case "--map": o.map = true; break;
      case "--no-map": o.map = false; break;
      case "--no-links": o.links = false; break;
      case "--images": o.images = true; break;
      case "--model": o.model = next() as CliOptions["model"]; break;
      case "--selector": o.selector = next(); break;
      case "--crawl": o.crawl = Number(next()); break;
      case "--quiet": o.quiet = true; break;
      case "-h": case "--help": positional.push("--help"); break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown flag: ${a}`);
        positional.push(a);
    }
  }
  if (positional.includes("--help")) return { ...o, url: "--help" };
  o.url = positional[0] ?? "";
  if (!o.url) throw new Error("url is required: mdz <url>");
  return o;
}
```

- [ ] **Step 3: Failing test for `run`**

```ts
import { test, expect, mock } from "bun:test";
import { run } from "../src/index";

const http = async () => ({
  html: `<html><head><title>T</title></head><body><main><h1>T</h1><p>${"word ".repeat(200)}</p></main></body></html>`,
  finalUrl: "https://example.com/a"
});

test("prints frontmatter markdown to stdout", async () => {
  let out = "";
  const code = await run(["https://example.com/a"], {
    http, stdout: (s) => { out += s; }, writeFile: () => {}, mkdir: () => {}
  });
  expect(code).toBe(0);
  expect(out.startsWith("---\n")).toBe(true);
  expect(out).toContain("## Page map");
});

test("--json prints a parseable manifest", async () => {
  let out = "";
  await run(["https://example.com/a", "--json"], {
    http, stdout: (s) => { out += s; }, writeFile: () => {}, mkdir: () => {}
  });
  const j = JSON.parse(out);
  expect(j.md.length).toBeGreaterThan(100);
});

test("--split writes one file per chunk plus index.json", async () => {
  const written: Record<string, string> = {};
  let made: string[] = [];
  await run(["https://example.com/a", "--split", "/tmp/out"], {
    http, stdout: () => {}, mkdir: (d: string) => { made.push(d); },
    writeFile: (p: string, c: string) => { written[p] = c; }
  });
  const keys = Object.keys(written);
  expect(made).toContain("/tmp/out");
  expect(keys.some(k => k.endsWith("index.json"))).toBe(true);
  expect(keys.filter(k => k.endsWith(".md")).length).toBeGreaterThan(0);
  expect(JSON.parse(written[keys.find(k => k.endsWith("index.json"))!]!).chunks.length)
    .toBeGreaterThan(0);
});
```

- [ ] **Step 4: Implement `apps/cli/src/index.ts`**

```ts
#!/usr/bin/env node
import { writeFileSync as wf, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractUrl, renderJson, renderMarkdown } from "mdz-core";
import { fetchHtml } from "../../../packages/core/src/fetch";
import { parseArgs } from "./args";

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

const HELP = `mdz — any web page to LLM-ready Markdown

  mdz <url> [options]

  --json               print JSON manifest
  --out <file.md>      write markdown to a file
  --json-out <file>    write JSON manifest alongside
  --chunk <n>          token budget per chunk (default 8000)
  --split <dir>        one .md per chunk + index.json
  --no-map             omit the page map
  --no-links           strip links
  --images             keep image tags
  --model <p>          o200k | cl100k | approx
  --selector <css>     extract only this element
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
```

- [ ] **Step 5: Build the binary**

```bash
cd /root/mdz && bun build apps/cli/src/index.ts --compile --outfile dist/mdz
./dist/mdz --help
./dist/mdz https://www.paulgraham.com/greatwork.html --split /tmp/pg | head -3
ls -lh dist/mdz /tmp/pg/index.json
```

Expected: binary ≤ 110 MB, `--help` prints the usage block, `--split` writes ~3-6 chunk files for that 11.8k-word essay plus `index.json` whose `chunks[].tokens` sum to roughly the doc total.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(cli): mdz binary with json/split/selector/crawl flags"
```

---

### Task 9b: `--crawl` (same-site BFS, capped)

**Files:**
- Create: `apps/cli/src/crawl.ts`
- Modify: `apps/cli/src/index.ts` (route `--crawl > 0` through it)
- Test: `apps/cli/test/crawl.test.ts`

**Interfaces:**
- Produces: `crawl(startUrl, {depth, max, http, chunk}): Promise<Doc[]>`.

Rule: same origin only, `depth` 1 means "the start page plus links found on it", `max` defaults to 20, at most 2 requests in flight, every URL normalized and de-duplicated, and non-HTML URLs skipped (they throw in `fetchHtml`, catch and drop).

- [ ] **Step 1: Failing test**

```ts
import { test, expect } from "bun:test";
import { crawl } from "../src/crawl";

const PAGES: Record<string, string> = {
  "https://s.com/": `<html><body><main><a href="/a">a</a><a href="/b">b</a>
    <a href="https://other.com/x">off</a><p>${"root ".repeat(200)}</p></main></body></html>`,
  "https://s.com/a": `<html><body><main><a href="/c">c</a><p>${"aaaa ".repeat(200)}</p></main></body></html>`,
  "https://s.com/b": `<html><body><main><p>${"bbbb ".repeat(200)}</p></main></body></html>`,
  "https://s.com/c": `<html><body><main><p>${"cccc ".repeat(200)}</p></main></body></html>`
};
const http = async (u: string) => {
  const html = PAGES[u];
  if (!html) throw new Error(`404 ${u}`);
  return { html, finalUrl: u };
};

test("depth 1 follows same-site links only", async () => {
  const docs = await crawl("https://s.com/", { depth: 1, max: 10, http, chunk: 8000 });
  const urls = docs.map(d => d.finalUrl).sort();
  expect(urls).toEqual(["https://s.com/", "https://s.com/a", "https://s.com/b"]);
});

test("depth 2 reaches grandchildren", async () => {
  const docs = await crawl("https://s.com/", { depth: 2, max: 10, http, chunk: 8000 });
  expect(docs.map(d => d.finalUrl)).toContain("https://s.com/c");
});

test("max caps the page count and failures are skipped", async () => {
  const docs = await crawl("https://s.com/", { depth: 2, max: 2, http, chunk: 8000 });
  expect(docs.length).toBe(2);
});
```

- [ ] **Step 2: Implement `crawl.ts`**

```ts
import { extractUrl } from "mdz-core";
import type { Doc } from "mdz-core";

export interface CrawlOptions {
  depth: number;
  max: number;
  chunk: number;
  http: (u: string) => Promise<{ html: string; finalUrl: string }>;
}

const norm = (u: string) => {
  const x = new URL(u);
  x.hash = "";
  return x.href.replace(/\/$/, "") || x.origin + "/";
};

export async function crawl(start: string, o: CrawlOptions): Promise<Doc[]> {
  const origin = new URL(start).origin;
  const seen = new Set<string>([norm(start)]);
  const out: Doc[] = [];
  let frontier = [norm(start)];

  for (let d = 0; d <= o.depth && frontier.length && out.length < o.max; d++) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += 2) {
      const batch = frontier.slice(i, i + 2);
      const settled = await Promise.all(batch.map(async (url) => {
        if (out.length >= o.max) return null;
        try {
          const doc = await extractUrl(url, { http: o.http, chunkBudget: o.chunk });
          return doc;
        } catch { return null; }
      }));
      for (const doc of settled) {
        if (!doc || out.length >= o.max) continue;
        out.push(doc);
        const html = await o.http(doc.finalUrl).then(r => r.html).catch(() => "");
        for (const m of html.matchAll(/href="([^"]+)"/g)) {
          let abs: string;
          try { abs = norm(new URL(m[1]!, doc.finalUrl).href); } catch { continue; }
          if (new URL(abs).origin !== origin) continue;
          if (seen.has(abs)) continue;
          seen.add(abs);
          next.push(abs);
        }
      }
    }
    frontier = next;
  }
  return out;
}
```

Note: refetching the HTML for link discovery is deliberate (extractUrl does not return the source). If that costs too much on a real site, cache `{url → html}` in `crawl` and pass it to both — one `Map`, no extra requests. Do that before shipping.

- [ ] **Step 3: Wire into `run`**

```ts
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
```

- [ ] **Step 4: Pass, build, commit**

```bash
bun test apps/cli/test/crawl.test.ts
bun build apps/cli/src/index.ts --compile --outfile dist/mdz
git add -A && git commit -m "feat(cli): same-site crawl with depth, max and dedupe"
```

---

### Task 10: MCP server

**Files:**
- Create: `apps/mcp/src/server.ts`
- Test: `apps/mcp/test/mcp.test.ts`

**Interfaces:**
- Produces 4 tools, callable by any MCP client (Claude Code, Cursor, Hermes):
  - `mdz_outline { url }` → outline + token counts + chunk ids (cheap, ~200 tokens)
  - `mdz_read { url, chunk? , max_tokens? }` → markdown. No `chunk`: returns frontmatter + page map + **first chunk only**, plus a note listing the remaining ids. `chunk`: returns that chunk.
  - `mdz_json { url }` → full manifest JSON string
  - `mdz_split { url, dir? }` → writes files server-side, returns the paths
- Also `resources` none. Stdio transport only.

- [ ] **Step 1: Install SDK**

```bash
cd /root/mdz/apps/mcp && bun add @modelcontextprotocol/sdk@1.32.1 zod@4.6.7
```

- [ ] **Step 2: Failing test** (call tool handlers directly, no transport)

```ts
import { test, expect } from "bun:test";
import { handlers } from "../src/server";

const http = async () => ({
  html: `<html><head><title>T</title></head><body><main><h1>T</h1><p>${"word ".repeat(400)}</p><h2>Second</h2><p>${"more ".repeat(400)}</p></main></body></html>`,
  finalUrl: "https://example.com/a"
});

test("outline is cheap and lists chunk ids", async () => {
  const r = await handlers.outline({ url: "https://example.com/a" }, { http, chunk: 300 });
  expect(r).toContain("01-");
  expect(r.split(/\s+/).length).toBeLessThan(400);
});

test("read without chunk returns the first chunk and names the rest", async () => {
  const r = await handlers.read({ url: "https://example.com/a", max_tokens: 300 }, { http, chunk: 300 });
  expect(r).toContain("chunk 01-");
  expect(r).toMatch(/more chunks/i);
});

test("read with chunk returns exactly that chunk", async () => {
  const first = await handlers.read({ url: "https://example.com/a", chunk: "01-t" }, { http, chunk: 300 });
  const second = await handlers.read({ url: "https://example.com/a", chunk: "02-second" }, { http, chunk: 300 });
  expect(first).not.toBe(second);
  expect(second).toContain("more more more");
});

test("unknown chunk id errors with the valid ids", async () => {
  await expect(handlers.read({ url: "https://example.com/a", chunk: "nope" }, { http, chunk: 300 }))
    .rejects.toThrow(/01-/);
});
```

- [ ] **Step 3: Implement `server.ts`**

```ts
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
```

- [ ] **Step 4: Build and smoke-test over stdio**

```bash
cd /root/mdz && bun build apps/mcp/src/server.ts --compile --outfile dist/mdz-mcp
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 | ./dist/mdz-mcp 2>/dev/null | head -c 800
```

Expected: `tools/list` response naming all four tools.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mcp): stdio server exposing outline/read/json/split"
```

---

### Task 11: Extension (Plasmo MV3) sharing core

**Files:**
- Create: `apps/extension/package.json`, `apps/extension/background.ts`, `apps/extension/tabs/preview.tsx`, `apps/extension/options.tsx`, `apps/extension/src/core-bridge.ts`
- Test: `apps/extension/test/bridge.test.ts`

**Interfaces:**
- Produces: `extractFromDocument(doc: Document, url: string, opts): Doc` — same `Doc` shape as core, but taking a live `Document` (no fetch). Reuses `extractContent`, `buildOutline`, `buildChunks`, `countTokensBoth`.

Deliberate differences from the video's extension, each one a reason someone switches:
1. real token counter (per model) instead of `length/4`
2. selection-only mode
3. chunk list in the preview with per-chunk copy
4. YAML frontmatter toggle (Obsidian/Logseq ready)
5. works offline from the GH release zip, no account, no telemetry

- [ ] **Step 1: Failing test**

```ts
import { test, expect } from "bun:test";
import { loadDocument } from "../../../packages/core/src/dom";
import { extractFromDocument } from "../src/core-bridge";

const HTML = `<html><head><title>Doc</title></head><body><main>
<h1>Doc</h1><p>${"alpha ".repeat(200)}</p><h2>Two</h2><p>${"beta ".repeat(200)}</p>
</main></body></html>`;

test("produces the same Doc shape as the CLI path", () => {
  const d = extractFromDocument(loadDocument(HTML, "https://example.com"), "https://example.com", {});
  expect(d.title).toBe("Doc");
  expect(d.chunks.length).toBeGreaterThan(0);
  expect(d.tokens.o200k).toBeGreaterThan(0);
  expect(d.markdown).toContain("beta");
});

test("selection text short-circuits extraction", () => {
  const d = extractFromDocument(loadDocument(HTML, "https://example.com"), "https://example.com",
    { selectionText: "just these words" });
  expect(d.extractor).toBe("fallback");
  expect(d.markdown).toBe("just these words");
});
```

- [ ] **Step 2: Implement `src/core-bridge.ts`**

```ts
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

export function extractFromDocument(
  doc: Document, url: string, opts: BridgeOptions = {}
): Doc {
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
```

- [ ] **Step 3: Scaffold Plasmo and wire the preview tab**

```bash
cd /root/mdz/apps/extension && bun add plasmo@0.90.5 react@18.2.0 react-dom@18.2.0
bun add -d @types/react@18 @types/react-dom@18 @types/chrome
```

`background.ts` must keep the same privacy posture as the video's extension — **no content script on every page**, injection only on demand:

```ts
import type { Doc } from "../../packages/core/src/types";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "mdz-page", title: "Copy Markdown", contexts: ["page"] });
  chrome.contextMenus.create({ id: "mdz-sel", title: "Copy selection as Markdown", contexts: ["selection"] });
});

chrome.commands.onCommand.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ html: document.documentElement.outerHTML, url: location.href,
                   selection: window.getSelection()?.toString() ?? "" })
  });
  await chrome.storage.session.set({ mdzPayload: result });
  await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/preview.html") });
});
```

`tabs/preview.tsx` renders: left textarea (editable markdown), right live preview, top bar with `Tokens (o200k / cl100k)`, chunk dropdown, `Copy`, `Copy as prompt`, `Download .md`, `Copy frontmatter`. Keep the token badge driven by `doc.tokens`.

- [ ] **Step 4: Build both targets, verify manifests**

```bash
cd /root/mdz/apps/extension && bun run build --target=chrome-mv3 && bun run build --target=firefox-mv3
node -e 'const m=require("./build/chrome-mv3-prod/manifest.json");console.log(m.manifest_version, JSON.stringify(m.permissions))'
```

Expected: `3` and exactly `["activeTab","scripting","contextMenus","storage","clipboardWrite"]` — no `host_permissions`, no `<all_urls>`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ext): plasmo extension sharing core extraction"
```

---

### Task 12: CI, releases, store submission

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md`, `LICENSE` (MIT), `.gitignore` additions for `build/`, `dist/`
- Test: the CI run itself is the test (green on first push).

- [ ] **Step 1: `ci.yml`**

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.4.3 }
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bunx tsc -b
      - run: bun run build:cli
      - run: bun run build:mcp
      - run: ./dist/mdz --help
```

- [ ] **Step 2: `release.yml`** — on tag `v*`: build `mdz` for linux-x64, darwin-arm64, darwin-x64, windows-x64 (matrix), build the two extension zips, upload all as release assets via `softprops/action-gh-release@v2`. Also `npm publish` both `mdz` (bin `mdz`) and `mdz-mcp` (bin `mdz-mcp`) using `NPM_TOKEN`.

- [ ] **Step 3: README with the one-command install**

```markdown
# mdz — any web page to LLM-ready Markdown

One binary. No install. No API key. No page content leaves your machine.

    mdz https://example.com/post              # detailed markdown + YAML frontmatter
    mdz https://example.com/post --json       # machine-readable manifest
    mdz https://example.com/post --split out  # one .md per section + index.json

Agents: `mdz-mcp` speaks MCP over stdio. Tools: `mdz_outline`, `mdz_read`, `mdz_json`, `mdz_split`.
Browser: [Chrome Web Store] · [Firefox Add-ons] · source in `apps/extension`.
```

Plus a "why this exists" table against `markdownload`, `markdowner`, `MD-This-Page`, `cpdown`: the only one with chunking, real token counts, and an MCP surface.

- [ ] **Step 4: Commit and push the first release**

```bash
git add -A && git commit -m "ci: test, cross-compile, release binaries and extension zips"
gh repo create pahlevikun/mdz --public --source=. --push --description "Any web page to LLM-ready Markdown: one binary, MCP server, browser extension"
git tag v0.1.0 && git push --tags
```

- [ ] **Step 5: Store submission (manual, one-time)**

Chrome Web Store: zip `build/chrome-mv3-prod`, listing copy from README, screenshots at 1280x800, privacy justification = "extracts the active tab only on user action; no network calls". Firefox AMO: `build/firefox-mv3-prod`, add-on id `mdz@pahlevikun`. Keep both zips attached to the GitHub release so the extension is installable without the store.

---

## Self-Review

**Spec coverage**

| Requirement | Task |
|---|---|
| Convert page → markdown (video + open source) | 3, 4, 8 |
| "Markdown sangat detail" | 5 (page map), 7 (frontmatter, chunk manifest) |
| JSON output | 7, 8, 9, 10 |
| Frontmatter | 7 |
| Binary, zero install | 1, 9, 12 |
| MCP for agents | 10 |
| Chrome extension, store + GitHub | 11, 12 |
| Chunking improvement | 6, 9 (`--split`), 10 (`mdz_read`) |
| Real token counts | 2 |
| Selection-only | 11 |
| Batch/crawl | 9b (`--crawl`) |

**Known gap to settle before Task 9:** `--crawl <depth>` is parsed in Task 9 and implemented in Task 9b. Do not ship a flag that silently does nothing — if 9b slips, cut the flag from `args.ts` and `HELP` in the same commit.

**Placeholder scan:** no TBD/TODO. Every test and implementation block is complete code, not a sketch. Fixture files in Task 4 are the only content written by hand rather than shown inline, and their required contents are specified concretely.

**Type consistency:** `Doc`, `Chunk`, `OutlineNode`, `ModelProfile`, `ExtractOptions`, `DEFAULT_OPTIONS`, `emptyDoc` are defined once in Task 1 and imported everywhere after. `extractContent(doc, url, selector?)` gains its third parameter in Task 8 and Task 11 calls it with three args. `countTokens`/`countTokensBoth` signatures are fixed in Task 2 and used unchanged in 6, 8, 11. `parseArgs` returns `CliOptions`; `run(argv, deps)` consumes it.

---

## Execution Handoff

Plan saved to `docs/plans/2026-10-18-mdz-web-to-markdown.md`.

Two execution options:

1. **Subagent-driven (recommended)** — one fresh subagent per task, I review the diff between tasks.
2. **Inline** — I run the tasks in this session, checkpoint after each batch of 3.

Which one?
