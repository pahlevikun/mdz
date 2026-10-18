import { useEffect, useMemo, useState } from "react";
import { extractFromDocument } from "../core-bridge";
import { countTokensBoth } from "../../../../packages/core/src/tokens";
import { toFrontmatter } from "../../../../packages/core/src/frontmatter";
import { renderMarkdown } from "../../../../packages/core/src/render";
import { renderMarkdownHtml } from "../md-render";
import { copyForFigma } from "../figma-copy";
import { withLayoutFrame } from "../figma-frame";
import { snapshotForFigma } from "../figma-snapshot";
import type { Doc } from "../../../../packages/core/src/types";

interface Payload {
  html: string;
  url: string;
  selection: string;
  viewportWidth?: number;
}

interface SyncSettings {
  frontmatter?: boolean;
  selectionOnly?: boolean;
  chunkBudget?: number;
  includeLinks?: boolean;
  includeImages?: boolean;
}

function slug(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "page";
}

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #__plasmo { height: 100%; margin: 0; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, sans-serif;
    background: #0f1115;
    color: #e6e8eb;
  }
  .root { display: flex; flex-direction: column; height: 100vh; }
  .bar {
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-bottom: 1px solid #252830;
    background: #14161a;
    overflow-x: auto;
  }
  .bar-title {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-domain {
    font-size: 12px;
    color: #9aa0a6;
    white-space: nowrap;
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 6px;
    background: #1e2128;
    color: #b8bcc4;
    white-space: nowrap;
  }
  .bar select, .bar label {
    font-size: 12px;
    color: #d7dbe0;
  }
  .bar select {
    background: #1e2128;
    border: 1px solid #3a3f47;
    border-radius: 6px;
    padding: 4px 8px;
    max-width: 220px;
  }
  .bar label { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .bar button {
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #3a3f47;
    background: #1e2128;
    color: #e6e8eb;
    cursor: pointer;
    white-space: nowrap;
  }
  .bar button:hover { background: #252a33; }
  .banner {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
    background: #3d2a14;
    color: #f0c674;
    border-bottom: 1px solid #5c4220;
  }
  .figma-note {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
    background: #1e2a3d;
    color: #9ec5ff;
    border-bottom: 1px solid #2a3f5c;
  }
  .figma-err {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
    background: #3d1e1e;
    color: #f48771;
    border-bottom: 1px solid #5c2a2a;
  }
  .cols {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
  }
  .cols textarea {
    width: 100%;
    height: 100%;
    resize: none;
    padding: 14px 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.55;
    background: #0f1115;
    color: #d7dbe0;
    border: none;
    outline: none;
  }
  .preview {
    height: 100%;
    overflow: auto;
    padding: 16px 20px;
    border-left: 1px solid #252830;
    line-height: 1.65;
    max-width: 100%;
  }
  .preview > * { max-width: 74ch; }
  .preview pre { overflow: auto; }
  .preview h1, .preview h2, .preview h3 { margin-top: 1.2em; }
  .preview a { color: #6ba3ff; }
  .preview code {
    font-size: 0.9em;
    background: #1e2128;
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  .preview pre code { background: transparent; padding: 0; }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    color: #9aa0a6;
  }
  .empty h1 { margin: 0; font-size: 28px; color: #e6e8eb; font-weight: 600; }
  .empty p { margin: 0; max-width: 420px; line-height: 1.5; font-size: 14px; }
  .empty .err { color: #f48771; }
  .empty kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 11px;
    font-family: inherit;
    background: #1e2128;
    border: 1px solid #3a3f47;
    border-radius: 4px;
    color: #e6e8eb;
  }
  .empty ul { list-style: none; padding: 0; margin: 8px 0 0; font-size: 13px; }
  .empty li { margin: 6px 0; }
  .shot-panel {
    flex-shrink: 0;
    padding: 12px 16px;
    border-bottom: 1px solid #252830;
    background: #14161a;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .shot-panel h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .shot-panel button {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #3a3f47;
    background: #2f6feb;
    color: #fff;
    cursor: pointer;
  }
  .shot-panel button:hover { filter: brightness(1.08); }
  @media (prefers-color-scheme: light) {
    body { background: #f6f7f9; color: #1a1d21; }
    .bar { background: #fff; border-bottom-color: #e2e4e8; }
    .bar-domain { color: #5f6368; }
    .badge { background: #eef0f3; color: #3c4043; }
    .bar select { background: #fff; border-color: #dadce0; color: #1a1d21; }
    .bar button { background: #fff; border-color: #dadce0; color: #1a1d21; }
    .bar button:hover { background: #f1f3f4; }
    .banner { background: #fef7e0; color: #7a5c00; border-bottom-color: #f9e8b8; }
    .figma-note { background: #e8f0fe; color: #174ea6; border-bottom-color: #c6dafc; }
    .figma-err { background: #fce8e6; color: #c5221f; border-bottom-color: #f5c6c2; }
    .cols textarea { background: #fff; color: #1a1d21; }
    .preview { border-left-color: #e2e4e8; }
    .preview a { color: #1a73e8; }
    .preview code { background: #eef0f3; }
    .empty h1 { color: #1a1d21; }
    .empty kbd { background: #eef0f3; border-color: #dadce0; color: #1a1d21; }
    .shot-panel { background: #fff; border-bottom-color: #e2e4e8; }
  }
`;

function PreviewTab() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [text, setText] = useState("");
  const [chunkId, setChunkId] = useState("all");
  const [showFrontmatter, setShowFrontmatter] = useState(true);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [mdzShot, setMdzShot] = useState<string | null>(null);
  const [figmaPreparing, setFigmaPreparing] = useState(false);
  const [figmaNote, setFigmaNote] = useState("");
  const [figmaError, setFigmaError] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [session, syncRaw] = await Promise.all([
          chrome.storage.session.get(["mdzPayload", "mdzShot"]),
          chrome.storage.sync.get(null),
        ]);
        const sync = syncRaw as SyncSettings;
        setShowFrontmatter(sync.frontmatter ?? true);
        const shot = session.mdzShot as string | undefined;
        if (shot) setMdzShot(shot);
        const p = session.mdzPayload as Payload | undefined;
        if (!p) {
          setError("");
          return;
        }
        setPayload(p);
        const dom = new DOMParser().parseFromString(p.html, "text/html");
        const useSel =
          (sync.selectionOnly ?? true) && p.selection.trim().length > 0;
        const d = extractFromDocument(dom, p.url, {
          chunkBudget: sync.chunkBudget ?? 8000,
          includeLinks: sync.includeLinks ?? true,
          includeImages: sync.includeImages ?? false,
          selectionText: useSel ? p.selection : undefined,
        });
        setDoc(d);
        setText(d.markdown);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const activeMd = useMemo(() => {
    if (!doc || chunkId === "all") return text;
    return doc.chunks.find((c) => c.id === chunkId)?.markdown ?? text;
  }, [doc, chunkId, text]);

  const tokens = useMemo(() => countTokensBoth(activeMd), [activeMd]);
  const html = useMemo(() => renderMarkdownHtml(activeMd), [activeMd]);
  const banner = useMemo(
    () =>
      /enable.{0,12}javascript/i.test(activeMd) ||
      (doc != null && doc.wordCount < 40 && doc.extractor === "fallback"),
    [activeMd, doc],
  );

  const finalUrl = doc?.finalUrl ?? "";

  const exportMd =
    showFrontmatter && doc
      ? renderMarkdown({ ...doc, markdown: activeMd }, { map: true })
      : activeMd;

  const flashCopy = async (label: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1200);
  };

  const onCopy = () => void flashCopy("copy", exportMd);

  const onCopyPrompt = () => {
    const prompt =
      "Convert or summarize the following page. URL: " +
      finalUrl +
      " Tokens: o200k " +
      tokens.o200k +
      " / cl100k " +
      tokens.cl100k +
      "\n\n" +
      activeMd;
    void flashCopy("prompt", prompt);
  };

  const figmaToDataUrl = (url: string): string | null => {
    if (url.startsWith("data:")) return url;
    try {
      const u = new URL(url, window.location.href);
      if (u.origin !== window.location.origin) return null;
    } catch {
      return null;
    }
    return null;
  };

  const onCopyFigma = async () => {
    if (!payload || figmaPreparing) return;
    const width = payload.viewportWidth ?? 1280;
    setFigmaPreparing(true);
    setFigmaError("");
    setFigmaNote("");
    try {
      let truncatedReason = "";
      const figmaHtml = await withLayoutFrame(
        payload.html,
        payload.url,
        { width },
        (root) => {
          const snap = snapshotForFigma(root, undefined, {
            toDataUrl: figmaToDataUrl,
          });
          if (snap.truncated && snap.reason) {
            truncatedReason = snap.reason;
          }
          return snap.html;
        },
      );
      await copyForFigma({
        figmaHtml,
        markdown: exportMd,
        pngDataUrl: mdzShot ?? undefined,
      });
      setCopied("figma");
      window.setTimeout(() => setCopied(""), 1200);
      let note = `Snapshot taken from the captured page at ${width}px.`;
      if (truncatedReason) {
        note += ` Copied a simplified snapshot: ${truncatedReason}.`;
      }
      setFigmaNote(note);
    } catch (e) {
      setFigmaError(e instanceof Error ? e.message : String(e));
    } finally {
      setFigmaPreparing(false);
    }
  };

  const onCopyFrontmatter = () => {
    if (!doc) return;
    const fm = toFrontmatter({
      title: doc.title,
      author: doc.author || undefined,
      published: doc.published || undefined,
      description: doc.description || undefined,
      url: finalUrl,
      domain: doc.domain || undefined,
      site_name: doc.siteName || undefined,
      lang: doc.lang || undefined,
      words: doc.wordCount,
      chars: doc.charCount,
      tokens_o200k: tokens.o200k,
      tokens_cl100k: tokens.cl100k,
      chunks: doc.chunks.length || undefined,
      extractor: doc.extractor,
      fetched_at: doc.fetchedAt,
      generator: "mdz",
    });
    void flashCopy("frontmatter", fm);
  };

  const onDownloadPng = () => {
    if (!mdzShot) return;
    const a = document.createElement("a");
    a.href = mdzShot;
    a.download = "screenshot.png";
    a.click();
  };

  const shotPanel =
    mdzShot ? (
      <div className="shot-panel">
        <h2>Screenshot</h2>
        <button type="button" onClick={onDownloadPng}>Download PNG</button>
      </div>
    ) : null;

  const onDownload = () => {
    const name = slug(doc?.title || "page") + ".md";
    const blob = new Blob([exportMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setCopied("download");
    window.setTimeout(() => setCopied(""), 1200);
  };

  const btn = (id: string, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}>
      {copied === id ? "Copied" : label}
    </button>
  );

  if (!doc) {
    return (
      <>
        <style>{css}</style>
        <div className="root">
          {shotPanel}
          <div className="empty">
            <h1>mdz</h1>
            {error ? (
              <p className="err">{error}</p>
            ) : (
              <p>
                Press Alt+Shift+C on any page, or right-click → Copy page as
                Markdown.
              </p>
            )}
            <ul>
              <li><kbd>Alt+Shift+C</kbd> — copy page</li>
              <li><kbd>Alt+Shift+S</kbd> — copy selection</li>
              <li><kbd>Alt+Shift+M</kbd> — open preview</li>
            </ul>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="root">
        {shotPanel}
        <header className="bar">
          <span className="bar-title">{doc.title || "Untitled"}</span>
          <span className="bar-domain">{doc.domain}</span>
          <span className="badge">
            o200k {tokens.o200k} · cl100k {tokens.cl100k}
          </span>
          <select
            value={chunkId}
            onChange={(e) => setChunkId(e.target.value)}
            aria-label="Chunk"
          >
            <option value="all">
              All — {doc.chunks.length} chunks
            </option>
            {doc.chunks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.title} ({c.tokens} tok)
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={showFrontmatter}
              onChange={(e) => setShowFrontmatter(e.target.checked)}
            />
            Frontmatter
          </label>
          {btn("copy", "Copy", onCopy)}
          {btn("prompt", "Copy as prompt", onCopyPrompt)}
          {btn("download", "Download .md", onDownload)}
          {btn("frontmatter", "Copy frontmatter", onCopyFrontmatter)}
          <button
            type="button"
            disabled={figmaPreparing}
            onClick={() => void onCopyFigma()}
          >
            {figmaPreparing
              ? "Preparing…"
              : copied === "figma"
                ? "Copied"
                : "Copy for Figma"}
          </button>
        </header>
        {figmaNote ? <div className="figma-note">{figmaNote}</div> : null}
        {figmaError ? <div className="figma-err">{figmaError}</div> : null}
        {banner ? (
          <div className="banner">
            This page may need JavaScript to render fully, or extraction found
            very little text.
          </div>
        ) : null}
        <div className="cols">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Markdown"
            spellCheck={false}
          />
          <div
            className="preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </>
  );
}

export default PreviewTab;
