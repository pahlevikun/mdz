import { test, expect } from "bun:test";
import { detectStack, type PageSignals } from "../src/tech-stack";

const emptySignals = (): PageSignals => ({
  url: "https://example.com/",
  generator: [],
  scriptHosts: [],
  resourceHosts: [],
  domIds: [],
  domClasses: [],
  dataAttrs: [],
  globals: [],
  contentType: "",
});

test("__NEXT_DATA__ id plus _next script host yields Next.js high with two evidence lines", () => {
  const report = detectStack({
    ...emptySignals(),
    domIds: ["__NEXT_DATA__"],
    scriptHosts: ["cdn.example.com_next"],
    globals: ["__NEXT_DATA__"],
  });
  const next = report.findings.find((f) => f.name === "Next.js");
  expect(next).toBeDefined();
  expect(next!.confidence).toBe("high");
  expect(next!.evidence.length).toBeGreaterThanOrEqual(2);
});

test("lone cdn.jsdelivr.net script host yields jsDelivr low", () => {
  const report = detectStack({
    ...emptySignals(),
    scriptHosts: ["cdn.jsdelivr.net"],
  });
  const jsd = report.findings.find((f) => f.name === "jsDelivr");
  expect(jsd).toBeDefined();
  expect(jsd!.confidence).toBe("low");
});

test("generator wordpress 6.4 yields WordPress high naming generator", () => {
  const report = detectStack({
    ...emptySignals(),
    generator: ["wordpress 6.4"],
  });
  const wp = report.findings.find((f) => f.name === "WordPress");
  expect(wp).toBeDefined();
  expect(wp!.confidence).toBe("high");
  expect(wp!.evidence.some((e) => e.includes("wordpress 6.4"))).toBe(true);
});

test("same category sorts by name; duplicate name merges evidence", () => {
  const report = detectStack({
    ...emptySignals(),
    generator: ["wordpress 6.4"],
    url: "https://example.com/wp-content/themes/twentytwenty/",
    scriptHosts: ["cdn.jsdelivr.net", "unpkg.com"],
  });
  const cdn = report.findings.filter((f) => f.category === "cdn");
  const names = cdn.map((f) => f.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(sorted);
  const wpCount = report.findings.filter((f) => f.name === "WordPress").length;
  expect(wpCount).toBe(1);
  const wp = report.findings.find((f) => f.name === "WordPress");
  expect(wp!.evidence.length).toBeGreaterThanOrEqual(2);
});

test("limitations always contain header and absence lines for rich signals", () => {
  const report = detectStack({
    ...emptySignals(),
    generator: ["wordpress 6.4"],
    scriptHosts: ["cdn.shopify.com"],
    resourceHosts: ["fonts.googleapis.com"],
    globals: ["Shopify"],
    domIds: ["root"],
  });
  expect(report.limitations.some((l) => l.includes("HTTP headers are not read"))).toBe(true);
  expect(report.limitations.some((l) => l.includes("not evidence of absence"))).toBe(true);
});

test("empty signals produce zero findings, all limitations, signals_seen 0", () => {
  const report = detectStack(emptySignals());
  expect(report.findings).toHaveLength(0);
  expect(report.signals_seen).toBe(0);
  expect(report.limitations.length).toBeGreaterThanOrEqual(3);
  expect(report.limitations.some((l) => l.includes("No external resources"))).toBe(true);
  expect(report.limitations.some((l) => l.includes("No generator meta tag"))).toBe(true);
});

test("no finding has empty evidence across many matches", () => {
  const report = detectStack({
    ...emptySignals(),
    url: "https://shop.example.com/wp-content/themes/x",
    generator: ["wordpress 6.4", "webflow"],
    scriptHosts: [
      "cdn.shopify.com",
      "js.stripe.com",
      "googletagmanager.com",
      "plausible.io",
      "cdn.jsdelivr.net",
      "static.cloudflareinsights.com",
      "parastorage.com",
    ],
    resourceHosts: ["cdn.cloudflare.net", "vercel.com", "netlify.app", "fonts.gstatic.com"],
    domIds: ["__next", "__NEXT_DATA__", "root", "ember-app"],
    domClasses: ["ng-star-inserted", "ember-view"],
    dataAttrs: ["data-astro-cid", "data-wf-page", "data-drupal-messages"],
    globals: [
      "__NEXT_DATA__",
      "__NUXT__",
      "Shopify",
      "gtag",
      "dataLayer",
      "posthog",
      "Stripe",
      "Intercom",
    ],
  });
  for (const f of report.findings) {
    expect(f.evidence.length).toBeGreaterThan(0);
  }
});
