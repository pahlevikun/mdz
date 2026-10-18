import Defd from "defuddle";
import TurndownService from "turndown";
// @ts-expect-error no published @types/turndown-plugin-gfm
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
// @ts-expect-error svg is valid to strip but omitted from turndown TagName typings
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

export function extractContent(doc: Document, url: string, selector?: string) {
  const source = selector ? doc.querySelector(selector) : null;
  const src = (source ?? doc) as Document;

  const warnings: string[] = [];
  let parsed: any = null;
  try {
    parsed = new Defuddle(src, { url, markdown: false, useAsync: false }).parse();
  } catch (e) {
    warnings.push(`defuddle failed: ${(e as Error).message}`);
  }

  const mainHtml = (parsed?.content ?? "").trim();
  let markdown = mainHtml ? htmlToMarkdown(mainHtml) : "";
  const pageText = (
    src.body?.textContent ?? source?.textContent ?? ""
  ).replace(/\s+/g, " ");
  const extracted = wordCount(markdown);
  const page = wordCount(pageText);

  let extractor: "defuddle" | "fallback" = "defuddle";
  if (!markdown || (extracted < MIN_WORDS && page > extracted * FALLBACK_RATIO)) {
    const root = source ?? src.body;
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
