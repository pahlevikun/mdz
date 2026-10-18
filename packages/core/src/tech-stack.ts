export interface PageSignals {
  url: string;
  generator: string[];
  scriptHosts: string[];
  resourceHosts: string[];
  domIds: string[];
  domClasses: string[];
  dataAttrs: string[];
  globals: string[];
  contentType: string;
}

export interface Finding {
  name: string;
  category: TechCategory;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export type TechCategory =
  | "framework"
  | "ui"
  | "ssr"
  | "cms"
  | "ecommerce"
  | "analytics"
  | "cdn"
  | "hosting"
  | "fonts"
  | "payments"
  | "support"
  | "monitoring"
  | "tag-manager"
  | "build"
  | "language";

export interface StackReport {
  url: string;
  findings: Finding[];
  limitations: string[];
  signals_seen: number;
}

type SignalKind =
  | "global"
  | "generator"
  | "scriptHost"
  | "resourceHost"
  | "domId"
  | "domClass"
  | "dataAttr"
  | "scriptPath"
  | "contentType";

interface EvidenceItem {
  text: string;
  kind: SignalKind;
  weak?: boolean;
}

interface Rule {
  name: string;
  category: TechCategory;
  test: (s: PageSignals) => EvidenceItem[];
}

function hasGlobal(s: PageSignals, name: string): boolean {
  return s.globals.includes(name);
}

function generatorHas(s: PageSignals, needle: string): boolean {
  return s.generator.some((g) => g.includes(needle));
}

function scriptHost(s: PageSignals, host: string): boolean {
  return s.scriptHosts.some((h) => h === host || h.endsWith("." + host) || h.includes(host));
}

function resourceHostEnds(s: PageSignals, suffix: string): boolean {
  return s.resourceHosts.some((h) => h.endsWith(suffix) || h === suffix);
}

function resourceHost(s: PageSignals, part: string): boolean {
  return s.resourceHosts.some((h) => h.includes(part));
}

function idPrefix(s: PageSignals, prefix: string): boolean {
  return s.domIds.some((id) => id.startsWith(prefix) || id === prefix);
}

function idIs(s: PageSignals, id: string): boolean {
  return s.domIds.includes(id);
}

function classPrefix(s: PageSignals, prefix: string): boolean {
  return s.domClasses.some((c) => c.startsWith(prefix));
}

function dataAttrPrefix(s: PageSignals, prefix: string): boolean {
  return s.dataAttrs.some((a) => a.startsWith(prefix));
}

function scriptPathContains(s: PageSignals, fragment: string): boolean {
  return s.url.includes(fragment) || s.scriptHosts.some((h) => h.includes(fragment));
}

function deriveConfidence(
  items: EvidenceItem[],
  category: TechCategory,
): "high" | "medium" | "low" {
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size >= 2) return "high";
  if (items.length === 0) return "low";
  if (items.every((i) => i.weak)) return "low";
  if (kinds.size === 1 && kinds.has("generator") && category === "cms") return "high";
  return "medium";
}

function countSignals(s: PageSignals): number {
  return (
    s.generator.length +
    s.scriptHosts.length +
    s.resourceHosts.length +
    s.domIds.length +
    s.domClasses.length +
    s.dataAttrs.length +
    s.globals.length +
    (s.contentType ? 1 : 0)
  );
}

const HEADER_LIMITATION =
  "HTTP headers are not read: no webRequest permission, so server-side signals are invisible.";
const MARKUP_LIMITATION =
  "Only markup and resource timing are inspected; a stack that leaves no trace in the DOM is reported as unknown.";
const ABSENCE_LIMITATION = "Absence of a finding is not evidence of absence.";
const NO_RESOURCES_LIMITATION =
  "No external resources were observed; most detections need at least one.";
const NO_GENERATOR_LIMITATION = "No generator meta tag found.";

function buildLimitations(s: PageSignals): string[] {
  const lines = [HEADER_LIMITATION, MARKUP_LIMITATION, ABSENCE_LIMITATION];
  if (s.scriptHosts.length === 0 && s.resourceHosts.length === 0) {
    lines.push(NO_RESOURCES_LIMITATION);
  }
  if (s.generator.length === 0) {
    lines.push(NO_GENERATOR_LIMITATION);
  }
  return lines;
}

const RULES: Rule[] = [
  {
    name: "Next.js",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "__NEXT_DATA__") || idIs(s, "__NEXT_DATA__")) {
        out.push({ text: "DOM marker __NEXT_DATA__ present", kind: "global" });
      }
      if (idIs(s, "__next")) {
        out.push({ text: 'Element id "__next"', kind: "domId" });
      }
      if (classPrefix(s, "__NEXT_DATA__")) {
        out.push({ text: "Class token prefixed __NEXT_DATA__", kind: "domClass" });
      }
      if (
        s.scriptHosts.some((h) => h.includes("_next")) ||
        s.url.includes("/_next/")
      ) {
        out.push({ text: "Script or host related to _next", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Nuxt",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "__NUXT__")) {
        out.push({ text: "DOM marker __NUXT__ present", kind: "global" });
      }
      if (idIs(s, "__nuxt")) {
        out.push({ text: 'Element id "__nuxt"', kind: "domId" });
      }
      if (scriptPathContains(s, "/_nuxt/")) {
        out.push({ text: "Script path contains /_nuxt/", kind: "scriptPath" });
      }
      return out;
    },
  },
  {
    name: "Gatsby",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (idIs(s, "___gatsby")) {
        out.push({ text: 'Element id "___gatsby"', kind: "domId" });
      }
      if (hasGlobal(s, "___loader")) {
        out.push({ text: "DOM marker ___loader present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "SvelteKit",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "__sveltekit")) {
        out.push({ text: "DOM marker __sveltekit present", kind: "global" });
      }
      if (dataAttrPrefix(s, "data-sveltekit-")) {
        out.push({ text: "data-sveltekit-* attribute", kind: "dataAttr" });
      }
      return out;
    },
  },
  {
    name: "Remix",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "__remixContext")) {
        out.push({ text: "DOM marker __remixContext present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Astro",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "astro")) {
        out.push({
          text: `Generator meta contains "astro" (${s.generator.find((g) => g.includes("astro"))})`,
          kind: "generator",
        });
      }
      if (dataAttrPrefix(s, "data-astro-")) {
        out.push({ text: "data-astro-* attribute", kind: "dataAttr" });
      }
      return out;
    },
  },
  {
    name: "Angular",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "ng")) {
        out.push({ text: "DOM marker ng present", kind: "global" });
      }
      if (classPrefix(s, "ng-")) {
        out.push({ text: "Class token prefixed ng-", kind: "domClass" });
      }
      if (dataAttrPrefix(s, "ng-version")) {
        out.push({ text: "ng-version data attribute", kind: "dataAttr" });
      }
      return out;
    },
  },
  {
    name: "Vue",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "__VUE__")) {
        out.push({ text: "DOM marker __VUE__ present", kind: "global" });
      }
      if (dataAttrPrefix(s, "data-v-")) {
        out.push({ text: "data-v-* attribute", kind: "dataAttr" });
      }
      return out;
    },
  },
  {
    name: "React",
    category: "framework",
    test(s) {
      const frameworkGlobals = [
        "__NEXT_DATA__",
        "__NUXT__",
        "__sveltekit",
        "__remixContext",
        "__VUE__",
        "ng",
      ];
      const hasFw = frameworkGlobals.some((g) => hasGlobal(s, g));
      const out: EvidenceItem[] = [];
      if (dataAttrPrefix(s, "data-reactroot")) {
        out.push({ text: "data-reactroot attribute", kind: "dataAttr" });
      }
      if (idIs(s, "root") && !hasFw) {
        out.push({ text: 'Element id "root" without other framework globals', kind: "domId" });
      }
      return out;
    },
  },
  {
    name: "Ember",
    category: "framework",
    test(s) {
      const out: EvidenceItem[] = [];
      if (idPrefix(s, "ember-")) {
        out.push({ text: "Element id prefixed ember-", kind: "domId" });
      }
      if (classPrefix(s, "ember-view")) {
        out.push({ text: "Class ember-view", kind: "domClass" });
      }
      return out;
    },
  },
  {
    name: "WordPress",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      const gen = s.generator.find((g) => g.includes("wordpress"));
      if (gen) {
        out.push({
          text: `Generator meta contains "wordpress" (${gen})`,
          kind: "generator",
        });
      }
      if (s.url.includes("/wp-content/") || s.scriptHosts.some((h) => h.includes("wp-content"))) {
        out.push({ text: "Path or host contains /wp-content/", kind: "scriptPath" });
      }
      if (s.url.includes("/wp-includes/") || s.scriptHosts.some((h) => h.includes("wp-includes"))) {
        out.push({ text: "Path or host contains /wp-includes/", kind: "scriptPath" });
      }
      return out;
    },
  },
  {
    name: "Drupal",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "drupal")) {
        out.push({
          text: `Generator meta contains "drupal" (${s.generator.find((g) => g.includes("drupal"))})`,
          kind: "generator",
        });
      }
      if (dataAttrPrefix(s, "data-drupal-")) {
        out.push({ text: "data-drupal-* attribute", kind: "dataAttr" });
      }
      return out;
    },
  },
  {
    name: "Joomla",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "joomla")) {
        out.push({
          text: `Generator meta contains "joomla" (${s.generator.find((g) => g.includes("joomla"))})`,
          kind: "generator",
        });
      }
      return out;
    },
  },
  {
    name: "Ghost",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "ghost")) {
        out.push({
          text: `Generator meta contains "ghost" (${s.generator.find((g) => g.includes("ghost"))})`,
          kind: "generator",
        });
      }
      return out;
    },
  },
  {
    name: "Hugo",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "hugo")) {
        out.push({
          text: `Generator meta contains "hugo" (${s.generator.find((g) => g.includes("hugo"))})`,
          kind: "generator",
        });
      }
      return out;
    },
  },
  {
    name: "Jekyll",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (generatorHas(s, "jekyll")) {
        out.push({
          text: `Generator meta contains "jekyll" (${s.generator.find((g) => g.includes("jekyll"))})`,
          kind: "generator",
        });
      }
      return out;
    },
  },
  {
    name: "Shopify",
    category: "ecommerce",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "cdn.shopify.com")) {
        out.push({ text: "Script host cdn.shopify.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "Shopify")) {
        out.push({ text: "DOM marker Shopify present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Webflow",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (dataAttrPrefix(s, "data-wf-")) {
        out.push({ text: "data-wf-* attribute", kind: "dataAttr" });
      }
      if (generatorHas(s, "webflow")) {
        out.push({
          text: `Generator meta contains "webflow" (${s.generator.find((g) => g.includes("webflow"))})`,
          kind: "generator",
        });
      }
      return out;
    },
  },
  {
    name: "Squarespace",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "static1.squarespace.com")) {
        out.push({ text: "Script host static1.squarespace.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Wix",
    category: "cms",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "parastorage.com")) {
        out.push({ text: "Script host parastorage.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "wixBiSession")) {
        out.push({ text: "DOM marker wixBiSession present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Google Analytics 4",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (s.scriptHosts.some((h) => h.includes("googletagmanager.com"))) {
        out.push({ text: "Script host googletagmanager.com (gtag path likely)", kind: "scriptHost" });
      }
      if (hasGlobal(s, "gtag")) {
        out.push({ text: "DOM marker gtag present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Google Tag Manager",
    category: "tag-manager",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "dataLayer")) {
        out.push({ text: "DOM marker dataLayer present", kind: "global" });
      }
      if (scriptHost(s, "googletagmanager.com")) {
        out.push({ text: "Script host googletagmanager.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Plausible",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "plausible.io")) {
        out.push({ text: "Script host plausible.io", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Fathom",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "usefathom.com")) {
        out.push({ text: "Script host usefathom.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "PostHog",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "posthog")) {
        out.push({ text: "DOM marker posthog present", kind: "global" });
      }
      if (scriptHost(s, "posthog.com")) {
        out.push({ text: "Script host posthog.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Mixpanel",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "mixpanel")) {
        out.push({ text: "DOM marker mixpanel present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Segment",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "analytics")) {
        out.push({ text: "DOM marker analytics present", kind: "global" });
      }
      if (scriptHost(s, "segment.com")) {
        out.push({ text: "Script host segment.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Hotjar",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "hotjar.com")) {
        out.push({ text: "Script host hotjar.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "hj")) {
        out.push({ text: "DOM marker hj present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Sentry",
    category: "monitoring",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "sentry.io")) {
        out.push({ text: "Script host sentry.io", kind: "scriptHost" });
      }
      if (hasGlobal(s, "Sentry")) {
        out.push({ text: "DOM marker Sentry present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Datadog RUM",
    category: "monitoring",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "datadoghq-browser-agent.com")) {
        out.push({ text: "Script host datadoghq-browser-agent.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Cloudflare Web Analytics",
    category: "analytics",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "static.cloudflareinsights.com")) {
        out.push({ text: "Script host static.cloudflareinsights.com", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Cloudflare",
    category: "cdn",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "cdnjs.cloudflare.com")) {
        out.push({
          text: "Script host cdnjs.cloudflare.com (shared CDN; could be many sites)",
          kind: "scriptHost",
          weak: true,
        });
      }
      if (resourceHostEnds(s, "cdn.cloudflare.net")) {
        out.push({
          text: "Resource host ends with cdn.cloudflare.net (shared CDN)",
          kind: "resourceHost",
          weak: true,
        });
      }
      return out;
    },
  },
  {
    name: "jsDelivr",
    category: "cdn",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "cdn.jsdelivr.net")) {
        out.push({
          text: "Script host cdn.jsdelivr.net (public CDN; library host only)",
          kind: "scriptHost",
          weak: true,
        });
      }
      return out;
    },
  },
  {
    name: "unpkg",
    category: "cdn",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "unpkg.com")) {
        out.push({
          text: "Script host unpkg.com (public CDN; library host only)",
          kind: "scriptHost",
          weak: true,
        });
      }
      return out;
    },
  },
  {
    name: "Vercel",
    category: "hosting",
    test(s) {
      const out: EvidenceItem[] = [];
      if (resourceHost(s, "vercel.com")) {
        out.push({ text: "Resource host vercel.com", kind: "resourceHost" });
      }
      if (s.scriptHosts.some((h) => h.includes("_vercel"))) {
        out.push({ text: "Script host contains _vercel", kind: "scriptHost" });
      }
      return out;
    },
  },
  {
    name: "Netlify",
    category: "hosting",
    test(s) {
      const out: EvidenceItem[] = [];
      if (resourceHost(s, "netlify.app")) {
        out.push({ text: "Resource host netlify.app", kind: "resourceHost" });
      }
      if (s.url.includes("/.netlify/")) {
        out.push({ text: "URL path contains /.netlify/", kind: "scriptPath" });
      }
      return out;
    },
  },
  {
    name: "Fastly",
    category: "cdn",
    test(s) {
      const out: EvidenceItem[] = [];
      if (resourceHostEnds(s, "fastly.net")) {
        out.push({
          text: "Resource host ends with fastly.net (shared CDN)",
          kind: "resourceHost",
          weak: true,
        });
      }
      return out;
    },
  },
  {
    name: "Amazon CloudFront",
    category: "cdn",
    test(s) {
      const out: EvidenceItem[] = [];
      if (resourceHostEnds(s, "cloudfront.net")) {
        out.push({ text: "Resource host ends with cloudfront.net", kind: "resourceHost" });
      }
      return out;
    },
  },
  {
    name: "Google Fonts",
    category: "fonts",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "fonts.googleapis.com") || resourceHost(s, "fonts.googleapis.com")) {
        out.push({ text: "fonts.googleapis.com in script or resource hosts", kind: "scriptHost" });
      }
      if (scriptHost(s, "fonts.gstatic.com") || resourceHost(s, "fonts.gstatic.com")) {
        out.push({ text: "fonts.gstatic.com in script or resource hosts", kind: "resourceHost" });
      }
      return out;
    },
  },
  {
    name: "Stripe",
    category: "payments",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "js.stripe.com")) {
        out.push({ text: "Script host js.stripe.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "Stripe")) {
        out.push({ text: "DOM marker Stripe present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "PayPal",
    category: "payments",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "paypal.com")) {
        out.push({ text: "Script host paypal.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "paypal")) {
        out.push({ text: "DOM marker paypal present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Shopify Payments",
    category: "payments",
    test(s) {
      const out: EvidenceItem[] = [];
      if (hasGlobal(s, "ShopifyPay")) {
        out.push({ text: "DOM marker ShopifyPay present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Intercom",
    category: "support",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "intercom.io") || scriptHost(s, "intercomcdn.com")) {
        out.push({ text: "Script host intercom.io or intercomcdn.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "Intercom")) {
        out.push({ text: "DOM marker Intercom present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Zendesk",
    category: "support",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "zdassets.com")) {
        out.push({ text: "Script host zdassets.com", kind: "scriptHost" });
      }
      if (hasGlobal(s, "zE")) {
        out.push({ text: "DOM marker zE present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Crisp",
    category: "support",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "crisp.chat")) {
        out.push({ text: "Script host crisp.chat", kind: "scriptHost" });
      }
      if (hasGlobal(s, "$crisp")) {
        out.push({ text: "DOM marker $crisp present", kind: "global" });
      }
      return out;
    },
  },
  {
    name: "Algolia",
    category: "support",
    test(s) {
      const out: EvidenceItem[] = [];
      if (scriptHost(s, "algolia.net") || scriptHost(s, "algolianet.com")) {
        out.push({ text: "Script host algolia.net or algolianet.com", kind: "scriptHost" });
      }
      return out;
    },
  },
];

function mergeFinding(
  map: Map<string, Finding & { items: EvidenceItem[] }>,
  name: string,
  category: TechCategory,
  items: EvidenceItem[],
): void {
  const existing = map.get(name);
  if (!existing) {
    map.set(name, {
      name,
      category,
      confidence: "low",
      evidence: [],
      items: [...items],
    });
    return;
  }
  existing.items.push(...items);
}

export function detectStack(s: PageSignals): StackReport {
  const map = new Map<string, Finding & { items: EvidenceItem[] }>();

  for (const rule of RULES) {
    const items = rule.test(s);
    if (items.length === 0) continue;
    mergeFinding(map, rule.name, rule.category, items);
  }

  const findings: Finding[] = [];
  for (const entry of map.values()) {
    const evidence = [...new Set(entry.items.map((i) => i.text))];
    findings.push({
      name: entry.name,
      category: entry.category,
      confidence: deriveConfidence(entry.items, entry.category),
      evidence,
    });
  }

  findings.sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name);
  });

  return {
    url: s.url,
    findings,
    limitations: buildLimitations(s),
    signals_seen: countSignals(s),
  };
}

export function renderStackJson(report: StackReport): string {
  return JSON.stringify(report, null, 2);
}
