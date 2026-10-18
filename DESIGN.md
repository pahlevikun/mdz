---
version: alpha
name: mdz
description: Browser extension and CLI that turn web pages into structured markdown, with a dark-first editor UI for preview and export.
colors:
  canvas: "#0f1115"
  panel: "#14161a"
  surface: "#1e2128"
  surface-raised: "#252830"
  border: "#3a3f47"
  border-strong: "#252a33"
  text: "#e6e8eb"
  text-body: "#d7dbe0"
  text-muted: "#9aa0a6"
  primary: "#2f6feb"
  primary-hover: "#2559c4"
  accent: "#6ba3ff"
  warning-bg: "#3d2a14"
  warning-text: "#f0c674"
  danger-bg: "#3d1e1e"
  danger-text: "#f48771"
  success-text: "#3fb950"
typography:
  h1:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: "1.2"
  body-md:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: "1.55"
  body-sm:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: 11px
    fontWeight: 500
    lineHeight: "1.4"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: "1.5"
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
rounded:
  sm: 4px
  md: 6px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "#ffffff"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
  button-ghost:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 8px
  badge-token:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
  badge-copied:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.success-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
  editor-surface:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-body}"
    typography: "{typography.code}"
    padding: 16px
  code-block:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-body}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: 8px
  banner-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-text}"
    typography: "{typography.body-sm}"
    padding: 8px
  banner-error:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    typography: "{typography.body-sm}"
    padding: 8px
  link-inline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.accent}"
    typography: "{typography.body-md}"
    padding: 0
  divider:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  panel-edge:
    backgroundColor: "{colors.border}"
    height: 1px
---

## Overview

mdz is a browser extension and toolchain that captures the active tab and produces clean markdown, outlines, and export artifacts. The product UI is dark-first: the editor canvas stays near-black so long reading sessions stay comfortable. One action color (`primary`) carries every intentional click target; everything else is neutral surfaces, borders, and text steps.

## Colors

### Dark (normative)

Default surfaces and text for popup, options, and the preview workspace.

- **canvas (`#0f1115`):** Page and editor background behind content.
- **panel (`#14161a`):** Popup card, options card, preview top bar.
- **surface (`#1e2128`):** Secondary panels, code blocks, ghost buttons, inputs.
- **surface-raised (`#252830`):** Hover fill on controls sitting on `surface`.
- **border (`#3a3f47`):** Outer borders on panels and controls.
- **border-strong (`#252a33`):** Dividers inside a panel (toolbar rules, column splits).
- **text (`#e6e8eb`):** Primary UI copy and headings in chrome.
- **text-body (`#d7dbe0`):** Markdown source and preview body copy.
- **text-muted (`#9aa0a6`):** Labels, domain line, footer, de-emphasized meta.
- **primary (`#2f6feb`):** Sole action color: primary buttons, active segments, key links in chrome.
- **primary-hover (`#2559c4`):** Hover state on filled primary buttons.
- **accent (`#6ba3ff`):** Links inside rendered markdown preview.
- **warning-bg (`#3d2a14`):** Warning banner and approximation badge background.
- **warning-text (`#f0c674`):** Warning banner and badge copy.
- **danger-bg (`#3d1e1e`):** Error banner background.
- **danger-text (`#f48771`):** Error banner and inline error copy.
- **success-text (`#3fb950`):** Positive confirmation copy (for example “copied”).

### Light (derived, partial)

Applied when `prefers-color-scheme: light` overrides chrome. Covers surfaces the extension paints; it is not audited to the same standard as dark and does not replace every dark token one-for-one.

- **canvas-light (`#ffffff`):** Page background in light override.
- **panel-light (`#f6f7f9`):** Card and bar surfaces.
- **surface-light (`#eef0f3`):** Secondary panels and code backgrounds.
- **border-light (`#e2e4e8`):** Panel and control borders.
- **border-strong-light (`#dadce0`):** Inner dividers.
- **text-light (`#1a1d21`):** Primary text.
- **text-muted-light (`#5f6368`):** Labels and secondary copy.
- **primary-light (`#1a73e8`):** Actions and in-preview links.
- **danger-text-light (`#c5221f`):** Error text in light banners.

## Typography

Two families: UI (`system-ui, -apple-system, Segoe UI, sans-serif`) for chrome and prose labels, and code (`ui-monospace, SFMono-Regular, Menlo, monospace`) for monospace snippets.

Scale in the front matter: `h1` at 28px / 600 for the single page title; `body-md` (13px) and `body-sm` (12px) cover routine UI and banners; `label` (11px / 500) is the smallest control copy; `code` (12.5px) is the mono size. Body territory in the shipped UI is 11–13px; 28px appears only once as the empty-state title.

## Layout

Spacing scale: `xs` 4px, `sm` 8px, `md` 12px, `lg` 16px, `xl` 24px. The preview tab uses a two-column grid: markdown source beside rendered preview, split by a vertical rule. The preview top bar is 48px tall and spans the full width above the columns.

## Elevation & Depth

No shadows anywhere in the product UI. Depth comes from a 1px border plus a step in background color (`canvas` → `panel` → `surface` → `surface-raised`). Shadows on dark panels read as dirt and add noise without improving hierarchy.

## Shapes

`rounded.sm` (4px) for small chips and keyboard hints. `rounded.md` (6px) for buttons, inputs, and panel corners. No other radii belong in the system.

## Components

- **button-primary:** Filled call to action on `panel` or `surface`. Uses `primary` fill and white label text. Do not use for navigation links inside markdown (use `accent` in preview instead).
- **button-primary-hover:** Hover state for filled primary actions only; swap fill to `primary-hover`, keep label white.
- **button-ghost:** Neutral control on `surface` with `border` outline. Do not fill with `primary` unless the control is the single primary action in that row.
- **badge-token:** Small status chip on warning background (`warning-bg` / `warning-text`). Do not use for errors (use `banner-error` or inline `danger-text`).
- **panel:** Default card shell: `panel` background, `text` copy, `rounded.md`. Do not nest more than one full panel border without a `surface` step between them.
- **banner-warning:** Full-width warning strip with `warning-bg` and `warning-text`. Do not use for speculative notes that are not actionable warnings.
- **banner-error:** Full-width error strip with `danger-bg` and `danger-text`. Do not downgrade errors to warning colors.

## Do's and Don'ts

- Do keep one action hue: `primary` and `primary-hover` for chrome actions; `accent` / `primary-light` only inside rendered content links.
- Do use the spacing scale (`4/8/12/16/24` px). Known drift in legacy layout still uses **2, 5, 10, 14, and 20** px in places — treat those as debt to remove, not as tokens.
- Do state that light mode is partial: use light tokens only where the extension applies `prefers-color-scheme: light`, and do not assume every dark semantic token has a light partner.
- Don't add box shadows for elevation.
- Don't document off-scale spacing (2, 5, 10, 14, 20 px) as part of the token system.
- Don't invent colors outside the tables above.

## Machine-readable companions

- `design/tokens.json` — W3C Design Tokens (DTCG) export of the same palette, typography, spacing, and radii; consumed by tooling and future codegen.
- `design/tokens.tailwind.json` — Tailwind v3 theme fragment mapping those tokens to `theme.extend` keys for any web UI that shares the extension chrome.
- `design/site-tree.json` — Hierarchical site outline output from mdz core; used by agents and docs pipelines that need page structure, not paint.
- `design/taxonomy.json` — Page-type guesses and overrides from mdz core; used when classifying URLs in exports and MCP responses.
