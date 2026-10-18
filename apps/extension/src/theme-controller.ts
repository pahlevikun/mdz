import {
  cssForMode,
  parseTheme,
  pickEngine,
  themeKey,
  type ThemeMode,
} from "./theme";

export type ApplyThemeResult = {
  engine: "emulate" | "filter" | "none";
  applied: boolean;
  note: string;
};

interface StoredTheme {
  mode: ThemeMode;
  engine: "filter" | "emulate";
}

const debuggerAttached = new Set<number>();

const FILTER_LIGHT_NOTE =
  "Light mode cannot be forced with the approximate filter; enable Precise theme emulation in settings.";

async function hasDebuggerPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ["debugger"] });
}

async function readStored(tabId: number): Promise<StoredTheme | undefined> {
  const key = themeKey(tabId);
  const data = await chrome.storage.session.get(key);
  const raw = data[key];
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const mode = parseTheme(o.mode);
  const engine = o.engine === "emulate" ? "emulate" : o.engine === "filter" ? "filter" : undefined;
  if (!engine || mode === "auto") return undefined;
  return { mode, engine };
}

async function writeStored(tabId: number, value: StoredTheme | null): Promise<void> {
  const key = themeKey(tabId);
  if (value === null) {
    await chrome.storage.session.remove(key);
    return;
  }
  await chrome.storage.session.set({ [key]: value });
}

async function detachDebugger(tabId: number): Promise<void> {
  if (!debuggerAttached.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* tab may already be gone */
  }
  debuggerAttached.delete(tabId);
}

async function clearFilterCss(tabId: number, mode: ThemeMode): Promise<void> {
  const css = cssForMode(mode);
  if (!css) return;
  try {
    await chrome.scripting.removeCSS({
      target: { tabId },
      css,
      origin: "USER",
    });
  } catch {
    /* best effort */
  }
}

export async function clearTheme(tabId: number): Promise<void> {
  const stored = await readStored(tabId);
  if (stored?.engine === "filter") {
    await clearFilterCss(tabId, stored.mode);
  }
  if (stored?.engine === "emulate" || debuggerAttached.has(tabId)) {
    await detachDebugger(tabId);
  }
  await writeStored(tabId, null);
}

export async function clearAllThemes(): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const tabIds = new Set<number>();
  for (const key of Object.keys(all)) {
    const m = /^mdz-theme-tab-(\d+)$/.exec(key);
    if (m) tabIds.add(Number(m[1]));
  }
  for (const id of debuggerAttached) tabIds.add(id);
  for (const tabId of tabIds) {
    await clearTheme(tabId);
  }
}

export async function applyTheme(
  tabId: number,
  mode: ThemeMode,
): Promise<ApplyThemeResult> {
  const parsed = parseTheme(mode);
  if (parsed === "auto") {
    await clearTheme(tabId);
    return { engine: "none", applied: true, note: "" };
  }

  await clearTheme(tabId);

  const engine = pickEngine(await hasDebuggerPermission());

  if (engine === "filter") {
    const css = cssForMode(parsed);
    if (!css) {
      await writeStored(tabId, null);
      return {
        engine: "filter",
        applied: false,
        note: FILTER_LIGHT_NOTE,
      };
    }
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        css,
        origin: "USER",
      });
      await writeStored(tabId, { mode: parsed, engine: "filter" });
      return { engine: "filter", applied: true, note: "" };
    } catch (e) {
      return {
        engine: "filter",
        applied: false,
        note: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    if (!debuggerAttached.has(tabId)) {
      await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ tabId }, "1.3", () => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        });
      });
      debuggerAttached.add(tabId);
    }
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.sendCommand(
        { tabId },
        "Emulation.setEmulatedMedia",
        {
          features: [{ name: "prefers-color-scheme", value: parsed }],
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        },
      );
    });
    await writeStored(tabId, { mode: parsed, engine: "emulate" });
    return { engine: "emulate", applied: true, note: "" };
  } catch (e) {
    await detachDebugger(tabId);
    await writeStored(tabId, null);
    return {
      engine: "emulate",
      applied: false,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

let initialized = false;

export function initThemeController(): void {
  if (initialized) return;
  initialized = true;

  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearTheme(tabId);
  });

  chrome.runtime.onStartup.addListener(() => {
    void clearAllThemes();
  });

  chrome.runtime.onInstalled.addListener(() => {
    void clearAllThemes();
  });
}
