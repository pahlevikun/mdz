import { useCallback, useState } from "react"
import type { ThemeMode } from "./theme"

const card: React.CSSProperties = {
  width: 260,
  background: "#14161a",
  color: "#e6e8eb",
  borderRadius: 12,
  padding: 14,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
}

const subtitle: React.CSSProperties = {
  margin: "4px 0 12px",
  fontSize: 12,
  color: "#9aa0a6",
  lineHeight: 1.35,
}

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  marginBottom: 6,
}

const kbd: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "system-ui, sans-serif",
  background: "#1e2128",
  border: "1px solid #3a3f47",
  borderRadius: 4,
  color: "#e6e8eb",
  whiteSpace: "nowrap",
}

const primaryBtn: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "#fff",
  background: "#2f6feb",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
}

const footer: React.CSSProperties = {
  marginTop: 12,
  fontSize: 10,
  color: "#9aa0a6",
  lineHeight: 1.4,
  textAlign: "center",
}

const errorLine: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#f28b82",
  lineHeight: 1.35,
}

const themeRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginTop: 12,
}

const themeSeg: React.CSSProperties = {
  flex: 1,
  padding: "6px 0",
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "#9aa0a6",
  background: "#1e2128",
  border: "1px solid #3a3f47",
  borderRadius: 6,
  cursor: "pointer",
}

const themeSegActive: React.CSSProperties = {
  ...themeSeg,
  color: "#e6e8eb",
  background: "#2f6feb",
  borderColor: "#2f6feb",
}

const themeNote: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#f0c674",
  lineHeight: 1.35,
}

const approxBadge: React.CSSProperties = {
  display: "inline-block",
  marginTop: 6,
  marginRight: 6,
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: 4,
  background: "#3d2a14",
  color: "#f0c674",
}

const THEME_OPTIONS: ThemeMode[] = ["auto", "dark", "light"]

function IndexPopup() {
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto")
  const [themeNoteText, setThemeNoteText] = useState("")
  const [themeEngine, setThemeEngine] = useState<"emulate" | "filter" | "none">("none")

  const fullPageScreenshot = useCallback(async () => {
    setScreenshotError(null)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) return
    const res = await chrome.runtime.sendMessage({ type: "mdz:screenshot", tabId: tab.id })
    if (res?.ok === false) {
      setScreenshotError(res.error ?? "Screenshot failed")
      return
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/preview.html") })
    window.close()
  }, [])

  const setTheme = useCallback(async (mode: ThemeMode) => {
    setThemeMode(mode)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) return
    const res = await chrome.runtime.sendMessage({
      type: "mdz:theme",
      tabId: tab.id,
      mode,
    })
    if (res && typeof res === "object") {
      setThemeEngine(
        res.engine === "emulate" || res.engine === "filter" ? res.engine : "none",
      )
      setThemeNoteText(typeof res.note === "string" ? res.note : "")
    }
  }, [])

  const grabPage = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id !== undefined) {
      const p = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          html: document.documentElement.outerHTML,
          url: location.href,
          selection: window.getSelection()?.toString() ?? "",
        }),
      })
      await chrome.storage.session.set({ mdzPayload: p[0]?.result })
      await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/preview.html") })
      window.close()
    }
  }, [])

  return (
    <div style={card}>
      <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>mdz</h1>
      <p style={subtitle}>Any page to LLM-ready Markdown</p>
      <div style={themeRow} role="group" aria-label="Page theme">
        {THEME_OPTIONS.map((mode) => (
          <button
            key={mode}
            type="button"
            style={themeMode === mode ? themeSegActive : themeSeg}
            onClick={() => void setTheme(mode)}
          >
            {mode === "auto" ? "Auto" : mode === "dark" ? "Dark" : "Light"}
          </button>
        ))}
      </div>
      {themeEngine === "filter" && themeMode !== "auto" ? (
        <span style={approxBadge}>Approximate</span>
      ) : null}
      {themeNoteText ? <p style={themeNote}>{themeNoteText}</p> : null}
      <div style={row}>
        <kbd style={kbd}>Alt+Shift+C</kbd>
        <span>page</span>
      </div>
      <div style={row}>
        <kbd style={kbd}>Alt+Shift+S</kbd>
        <span>selection</span>
      </div>
      <div style={row}>
        <kbd style={kbd}>Alt+Shift+M</kbd>
        <span>preview</span>
      </div>
      <button type="button" style={primaryBtn} onClick={() => void grabPage()}>
        Grab this page
      </button>
      <button
        type="button"
        style={{ ...primaryBtn, marginTop: 8, background: "#1e2128", border: "1px solid #3a3f47" }}
        onClick={() => void fullPageScreenshot()}
      >
        Full page screenshot
      </button>
      {screenshotError ? <p style={errorLine} role="alert">{screenshotError}</p> : null}
      <p style={footer}>No account. No telemetry. Nothing leaves this machine.</p>
    </div>
  )
}

export default IndexPopup
