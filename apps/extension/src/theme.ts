export type ThemeMode = "auto" | "dark" | "light";

export interface ThemeEngine {
  apply(tabId: number, mode: ThemeMode): Promise<void>;
  clear(tabId: number): Promise<void>;
}

export const THEME_CSS_ID = "mdz-theme";

export function filterCss(mode: ThemeMode): string {
  if (mode !== "dark") return "";
  const htmlRule =
    "html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}";
  const counter =
    'html img,html video,html picture,html canvas,html svg,html iframe,html [style*="background-image"]{filter:invert(1) hue-rotate(180deg)}';
  return htmlRule + counter;
}

export function cssForMode(mode: ThemeMode): string {
  return filterCss(mode);
}

export function pickEngine(hasDebugger: boolean): "emulate" | "filter" {
  return hasDebugger ? "emulate" : "filter";
}

export function themeKey(tabId: number): string {
  return `mdz-theme-tab-${tabId}`;
}

export function parseTheme(raw: unknown): ThemeMode {
  if (raw === "dark" || raw === "light") return raw;
  return "auto";
}
