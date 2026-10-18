import { useCallback, useEffect, useState } from "react"

const page: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: 24,
  background: "#14161a",
  color: "#e6e8eb",
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
  minHeight: "100vh",
}

const subtitle: React.CSSProperties = {
  margin: "4px 0 20px",
  fontSize: 13,
  color: "#9aa0a6",
  lineHeight: 1.35,
}

const field: React.CSSProperties = {
  marginBottom: 16,
}

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
}

const helper: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#9aa0a6",
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#e6e8eb",
  background: "#1e2128",
  border: "1px solid #3a3f47",
  borderRadius: 8,
  boxSizing: "border-box",
}

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  marginBottom: 12,
}

const primaryBtn: React.CSSProperties = {
  marginTop: 8,
  padding: "10px 16px",
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
  marginTop: 24,
  fontSize: 11,
  color: "#9aa0a6",
  lineHeight: 1.45,
}

interface Settings {
  chunkBudget: number
  includeLinks: boolean
  includeImages: boolean
  selectionOnly: boolean
  frontmatter: boolean
}

const DEFAULTS: Settings = {
  chunkBudget: 8000,
  includeLinks: true,
  includeImages: false,
  selectionOnly: true,
  frontmatter: true,
}

function OptionsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void chrome.storage.sync.get(null).then((raw) => {
      setSettings({
        chunkBudget:
          typeof raw.chunkBudget === "number"
            ? raw.chunkBudget
            : DEFAULTS.chunkBudget,
        includeLinks:
          typeof raw.includeLinks === "boolean"
            ? raw.includeLinks
            : DEFAULTS.includeLinks,
        includeImages:
          typeof raw.includeImages === "boolean"
            ? raw.includeImages
            : DEFAULTS.includeImages,
        selectionOnly:
          typeof raw.selectionOnly === "boolean"
            ? raw.selectionOnly
            : DEFAULTS.selectionOnly,
        frontmatter:
          typeof raw.frontmatter === "boolean"
            ? raw.frontmatter
            : DEFAULTS.frontmatter,
      })
    })
  }, [])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      void chrome.storage.sync.set(settings).then(() => {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1500)
      })
    },
    [settings],
  )

  return (
    <div style={page}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>mdz settings</h1>
      <p style={subtitle}>Defaults for Markdown extraction and preview.</p>
      <form onSubmit={onSubmit}>
        <div style={field}>
          <label htmlFor="chunkBudget" style={label}>Chunk budget</label>
          <input
            id="chunkBudget"
            type="number"
            min={500}
            step={500}
            value={settings.chunkBudget}
            style={input}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                chunkBudget: Number(e.target.value),
              }))
            }
          />
          <p style={helper}>Tokens per chunk.</p>
        </div>
        <div style={checkRow}>
          <input
            id="includeLinks"
            type="checkbox"
            checked={settings.includeLinks}
            onChange={(e) =>
              setSettings((s) => ({ ...s, includeLinks: e.target.checked }))
            }
          />
          <label htmlFor="includeLinks">Include links</label>
        </div>
        <div style={checkRow}>
          <input
            id="includeImages"
            type="checkbox"
            checked={settings.includeImages}
            onChange={(e) =>
              setSettings((s) => ({ ...s, includeImages: e.target.checked }))
            }
          />
          <label htmlFor="includeImages">Include images</label>
        </div>
        <div style={checkRow}>
          <input
            id="selectionOnly"
            type="checkbox"
            checked={settings.selectionOnly}
            onChange={(e) =>
              setSettings((s) => ({ ...s, selectionOnly: e.target.checked }))
            }
          />
          <label htmlFor="selectionOnly">
            Use selection when text is selected
          </label>
        </div>
        <div style={checkRow}>
          <input
            id="frontmatter"
            type="checkbox"
            checked={settings.frontmatter}
            onChange={(e) =>
              setSettings((s) => ({ ...s, frontmatter: e.target.checked }))
            }
          />
          <label htmlFor="frontmatter">
            Include YAML frontmatter by default
          </label>
        </div>
        <button type="submit" style={primaryBtn}>
          {saved ? "Saved" : "Save"}
        </button>
      </form>
      <p style={footer}>
        mdz reads the active tab only when you press a shortcut. No account, no
        telemetry, no network requests.
      </p>
    </div>
  )
}

export default OptionsPage
