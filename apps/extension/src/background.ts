import { planShot, stitchFrames } from "./screenshot";
import { applyTheme, clearTheme, initThemeController } from "./theme-controller";
import { parseTheme } from "./theme";
import { collectSignals } from "./stack-signals";
import type { PageSignals } from "../../../packages/core/src/tech-stack";

initThemeController();

export interface Payload {
  html: string;
  url: string;
  selection: string;
  pageSignals?: PageSignals;
}

interface MeasureResult {
  viewportWidth: number;
  viewportHeight: number;
  docHeight: number;
  dpr: number;
}

async function injectRestore(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const state = (window as unknown as { __mdzShot?: { hidden: Element[]; scrollBehavior: string; originalY: number } }).__mdzShot;
      if (!state) return;
      for (const el of state.hidden) {
        (el as HTMLElement).style.visibility = "";
      }
      document.documentElement.style.scrollBehavior = state.scrollBehavior;
      window.scrollTo(0, state.originalY);
      delete (window as unknown as { __mdzShot?: unknown }).__mdzShot;
    },
  });
}

export async function runScreenshot(tabId: number): Promise<void> {
  let restoreNeeded = false;
  try {
    const [measureRes] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (): MeasureResult => ({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        docHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
        dpr: window.devicePixelRatio || 1,
      }),
    });
    const measure = measureRes?.result as MeasureResult | undefined;
    if (!measure) throw new Error("Could not measure page");

    const plan = planShot(measure);
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const hidden: Element[] = [];
        for (const el of document.querySelectorAll("*")) {
          const pos = getComputedStyle(el).position;
          if (pos === "fixed" || pos === "sticky") {
            (el as HTMLElement).style.visibility = "hidden";
            hidden.push(el);
          }
        }
        const scrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = "auto";
        (window as unknown as { __mdzShot: { hidden: Element[]; scrollBehavior: string; originalY: number } }).__mdzShot = {
          hidden,
          scrollBehavior,
          originalY: window.scrollY,
        };
      },
    });
    restoreNeeded = true;

    const captured: { dataUrl: string; cssTop: number }[] = [];
    for (let i = 0; i < plan.frames; i++) {
      const cssTop = i * plan.frameHeight;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (y: number) =>
          new Promise<void>((resolve) => {
            window.scrollTo(0, y);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => window.setTimeout(() => resolve(), 90)),
            );
          }),
        args: [cssTop],
      });
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      captured.push({ dataUrl, cssTop });
    }

    await injectRestore(tabId);
    restoreNeeded = false;

    const png = await stitchFrames(plan, captured);
    await chrome.storage.session.set({ mdzShot: png });
  } catch (e) {
    if (restoreNeeded) {
      try {
        await injectRestore(tabId);
      } catch {
        /* best effort */
      }
    }
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

export async function grab(tabId: number): Promise<Payload | null> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      html: document.documentElement.outerHTML,
      url: location.href,
      selection: window.getSelection()?.toString() ?? "",
    }),
  });
  const base = res?.result as Omit<Payload, "pageSignals"> | undefined;
  if (!base) return null;
  let pageSignals: PageSignals | undefined;
  try {
    const [sigRes] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectSignals,
    });
    pageSignals = sigRes?.result as PageSignals | undefined;
  } catch {
    pageSignals = undefined;
  }
  return { ...base, pageSignals };
}

export async function open(payload: Payload): Promise<void> {
  await chrome.storage.session.set({ mdzPayload: payload });
  await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/preview.html") });
}

async function fromActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const payload = await grab(tab.id);
  if (payload) await open(payload);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mdz-page",
    title: "Copy page as Markdown",
    contexts: ["page", "frame"],
  });
  chrome.contextMenus.create({
    id: "mdz-sel",
    title: "Copy selection as Markdown",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (_info, tab) => {
  if (tab?.id === undefined) return;
  const payload = await grab(tab.id);
  if (payload) await open(payload);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "mdz-copy-page" || command === "mdz-copy-selection") {
    await fromActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "mdz:grab") {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse(null);
      return true;
    }
    void grab(tabId).then(sendResponse);
    return true;
  }
  if (message?.type === "mdz:screenshot") {
    const tabId = message.tabId as number | undefined;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: "No tab" });
      return true;
    }
    void runScreenshot(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    return true;
  }
  if (message?.type === "mdz:theme") {
    const tabId = message.tabId as number | undefined;
    if (tabId === undefined) {
      sendResponse({
        engine: "none",
        applied: false,
        note: "No tab",
      });
      return true;
    }
    const mode = parseTheme(message.mode);
    void applyTheme(tabId, mode)
      .then(sendResponse)
      .catch((err: unknown) =>
        sendResponse({
          engine: "none",
          applied: false,
          note: err instanceof Error ? err.message : String(err),
        }),
      );
    return true;
  }
  if (message?.type === "mdz:theme-clear") {
    const tabId = message.tabId as number | undefined;
    if (tabId !== undefined) {
      void clearTheme(tabId)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    } else {
      sendResponse({ ok: false });
    }
    return true;
  }
  return undefined;
});
