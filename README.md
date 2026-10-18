# mdz — any web page to LLM-ready Markdown

<p align="center">
  <img src="assets/logo-animated.svg" alt="mdz — any page to LLM-ready markdown" width="100%">
</p>

Turn a web page into markdown that an LLM can read. One binary. No account. No API key. Nothing leaves your machine.

```bash
mdz https://example.com/post                 # markdown to stdout
mdz https://example.com/post --json          # one JSON manifest
mdz https://example.com/post --split out     # one .md per section
```

## Install

Pick your platform. Each line downloads one file and makes it executable.

```bash
# Linux x64
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-linux-x64 -o mdz && chmod +x mdz

# macOS, Apple Silicon
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-darwin-arm64 -o mdz && chmod +x mdz

# macOS, Intel
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-darwin-x64 -o mdz && chmod +x mdz

# Windows x64
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-windows-x64.exe -o mdz.exe
```

Not on npm yet. Build it yourself with `bun run build:cli`.

Run `mdz --help` for the full flag list.

## What you get

- Markdown split by heading. Each section becomes its own chunk with a stable id.
- Token counts from the real tokenizer, for both `o200k` and `cl100k`. Not `length / 4`.
- YAML frontmatter that Obsidian and Logseq read without changes.
- The same extraction in three places: CLI, MCP server, browser extension.

## Agents

`mdz-mcp` speaks MCP over stdio. It fetches, chunks and returns pages so an agent can read a long document a piece at a time instead of blowing its context.

Tools:

- `mdz_outline` — section list and chunk ids, cheap, call this first
- `mdz_read` — one chunk of markdown, or the first chunk plus the remaining ids
- `mdz_json` — the full manifest
- `mdz_split` — write one `.md` per chunk plus `index.json`
- `mdz_design_tokens` — derive `DESIGN.md` tokens from a page's declared styles

```json
{
  "mcpServers": {
    "mdz": {
      "command": "mdz-mcp"
    }
  }
}
```

### Teaching the agent to use it

Tools alone do not make an agent read a page in the right order. The companion
skill does that: `skills/mdz-read/SKILL.md` tells the agent to call
`mdz_outline` first, pick the chunks the question needs, and read only those —
plus what to do when a page is blocked or JS-only.

```bash
npx skills add pahlevikun/mdz/skills/mdz-read
```

`mdz_design_tokens` reads `<style>` blocks and `style` attributes, not rendered pixels. A page styled only by external CSS returns few colors. That is a real limit, and the tool says so in its output.

## Browser extension

Chrome and Firefox, Manifest V3. Install from the release zip, or load `apps/extension/build/chrome-mv3-prod` unpacked.

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Convert the page |
| `Alt+Shift+S` | Convert the selection |
| `Alt+Shift+M` | Open the preview tab |

The preview tab gives you an editable markdown pane next to a live render, with a chunk picker, a token badge, copy, download, and export.

Also in the preview tab:

- **Full page screenshot** — scrolls and stitches the whole page into one PNG.
- **Copy for Figma** — puts HTML, PNG and markdown on the clipboard together. Paste into Figma desktop and you get editable frames, not a flat image.
- **Design tokens** — downloads `DESIGN.md` and `tokens.json` built from the page's own palette.
- **Stack** — lists frameworks, analytics and hosting found in the page, with the evidence for each one.

Dark and light simulation per tab. Approximate by default, using a CSS filter. Grant the optional `debugger` permission in settings to get the site's real theme instead.

### Permissions

`activeTab`, `scripting`, `contextMenus`, `storage`, `clipboardWrite`.

Optional: `debugger`, only if you turn on precise theme emulation.

There is no `host_permissions` and no content script. The extension reads the active tab when you press a shortcut, and never before.

## Design

The palette, type scale and component rules live in [DESIGN.md](DESIGN.md). Machine-readable copies are in [`design/`](design/), and `bun run scripts/check-tokens.ts` fails if the three files drift apart.

## Development

```bash
bun install
bun test
bunx tsc -b
bun run build:cli
bun run build:mcp
cd apps/extension && bun run build --target=chrome-mv3
```

## License

MIT. See [LICENSE](LICENSE).
