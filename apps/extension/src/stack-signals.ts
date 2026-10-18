import type { PageSignals } from "../../../packages/core/src/tech-stack";

const DOM_ID_CAP = 2000;
const DOM_CLASS_CAP = 4000;
const DATA_ATTR_NODE_BUDGET = 3000;

const GLOBAL_DOM_IDS = [
  "__NEXT_DATA__",
  "__NUXT__",
  "__sveltekit",
  "__remixContext",
  "___loader",
  "__VUE__",
  "ng",
  "Shopify",
  "ShopifyPay",
  "Stripe",
  "paypal",
  "gtag",
  "dataLayer",
  "posthog",
  "mixpanel",
  "analytics",
  "hj",
  "Sentry",
  "Intercom",
  "zE",
  "$crisp",
  "wixBiSession",
];

function collectDomIdsAndClasses(doc: Document): { ids: string[]; classes: string[] } {
  const ids: string[] = [];
  const classSet = new Set<string>();
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (ids.length < DOM_ID_CAP && el.id) {
        ids.push(el.id);
      }
      if (classSet.size < DOM_CLASS_CAP && el.classList.length > 0) {
        for (const token of el.classList) {
          if (classSet.size >= DOM_CLASS_CAP) break;
          classSet.add(token);
        }
      }
      if (ids.length >= DOM_ID_CAP && classSet.size >= DOM_CLASS_CAP) break;
    }
    node = walker.nextNode();
  }
  return { ids, classes: [...classSet] };
}

function collectDataAttrs(doc: Document): string[] {
  const seen = new Set<string>();
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  let budget = DATA_ATTR_NODE_BUDGET;
  let node: Node | null = walker.currentNode;
  while (node && budget > 0) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      budget--;
      const el = node as Element;
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-")) {
          seen.add(attr.name);
        }
      }
    }
    node = walker.nextNode();
  }
  return [...seen];
}

function collectGlobals(doc: Document): string[] {
  const found = new Set<string>();
  for (const id of GLOBAL_DOM_IDS) {
    if (doc.getElementById(id)) {
      found.add(id);
    }
  }
  for (const script of doc.querySelectorAll("script")) {
    const text = script.textContent ?? "";
    if (text.includes("gtag(") || text.includes("window.gtag")) found.add("gtag");
    if (text.includes("dataLayer")) found.add("dataLayer");
    if (text.includes("posthog")) found.add("posthog");
    if (text.includes("mixpanel")) found.add("mixpanel");
    if (text.includes("analytics.track") || text.includes("window.analytics")) {
      found.add("analytics");
    }
    if (text.includes("Sentry.init")) found.add("Sentry");
    if (text.includes("Intercom(")) found.add("Intercom");
    if (text.includes("$crisp")) found.add("$crisp");
    if (text.includes("wixBiSession")) found.add("wixBiSession");
    if (text.includes("__NUXT__")) found.add("__NUXT__");
    if (text.includes("__sveltekit")) found.add("__sveltekit");
    if (text.includes("__remixContext")) found.add("__remixContext");
    if (text.includes("Shopify.")) found.add("Shopify");
    if (text.includes("Stripe(")) found.add("Stripe");
  }
  return [...found];
}

function collectGenerators(doc: Document): string[] {
  const gens: string[] = [];
  for (const meta of doc.querySelectorAll('meta[name="generator"]')) {
    const content = meta.getAttribute("content");
    if (content) gens.push(content.toLowerCase());
  }
  return gens;
}

function collectScriptHosts(doc: Document, pageUrl: string): string[] {
  const hosts = new Set<string>();
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = "";
  }
  for (const script of doc.querySelectorAll("script[src]")) {
    const src = script.getAttribute("src");
    if (!src) continue;
    try {
      const url = new URL(src, pageUrl);
      if (url.origin === origin) {
        if (url.pathname.includes("/_nuxt/")) hosts.add("_nuxt_path");
        if (url.pathname.includes("/_next/")) hosts.add("_next_path");
        continue;
      }
      hosts.add(url.hostname);
      if (url.pathname.includes("/gtag/")) hosts.add(`${url.hostname}/gtag`);
    } catch {
      /* skip bad URLs */
    }
  }
  return [...hosts];
}

function collectResourceHosts(): string[] {
  const hosts = new Set<string>();
  try {
    const entries = performance.getEntriesByType("resource");
    for (const entry of entries) {
      if (typeof entry.name !== "string") continue;
      try {
        hosts.add(new URL(entry.name).hostname);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* performance unavailable */
  }
  return [...hosts];
}

export function gatherPageSignals(doc: Document, url: string): PageSignals {
  const { ids, classes } = collectDomIdsAndClasses(doc);
  return {
    url,
    generator: collectGenerators(doc),
    scriptHosts: collectScriptHosts(doc, url),
    resourceHosts: collectResourceHosts(),
    domIds: ids,
    domClasses: classes,
    dataAttrs: collectDataAttrs(doc),
    globals: collectGlobals(doc),
    contentType: doc.contentType || "",
  };
}

export function collectSignals(): PageSignals {
  return gatherPageSignals(document, location.href);
}
