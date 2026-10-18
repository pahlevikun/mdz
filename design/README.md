# design/

Machine-readable companions for the root `DESIGN.md` spec. They are maintained by hand today; when the palette or scale in `DESIGN.md` changes, update these files in the same change and run `bun run scripts/check-tokens.ts`.

- **`tokens.json`** — W3C DTCG token set (`color.dark` / `color.light`, typography, spacing, rounded). Read by export tooling, agents, and `scripts/check-tokens.ts`.
- **`tokens.tailwind.json`** — Tailwind v3 `theme.extend` fragment (colors, fontFamily, fontSize, spacing, borderRadius). Read by any web UI that wants Tailwind class names aligned with the extension chrome.
- **`site-tree.json`** — (when present) Site outline graph from mdz core for structure-aware docs and MCP.
- **`taxonomy.json`** — (when present) Page-type classification output from mdz core for routing and summaries.
