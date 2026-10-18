# mdz — any web page to LLM-ready Markdown

One binary. No install. No API key. No page content leaves your machine.

```bash
mdz https://example.com/post              # print Markdown to stdout
mdz https://example.com/post --json       # structured JSON output
mdz https://example.com/post --split out  # write heading-aware chunk files
mdz https://example.com --crawl 2 --split out  # crawl depth 2, split to disk
```

## Install

```bash
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-linux-x64 -o mdz && chmod +x mdz
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-darwin-arm64 -o mdz && chmod +x mdz
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-darwin-x64 -o mdz && chmod +x mdz
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-windows-x64.exe -o mdz.exe
```

Not on npm yet — build from source with `bun run build:cli`.

## Agents

`mdz-mcp` runs over stdio and exposes tools `mdz_outline`, `mdz_read`, `mdz_json`, and `mdz_split` so agents can fetch and chunk pages without sending content to a third-party API.

```json
{
  "mcpServers": {
    "mdz": {
      "command": "mdz-mcp"
    }
  }
}
```

## Browser extension

Chrome and Firefox MV3 builds are available from release zips or the browser stores.

| Shortcut | Action |
|----------|--------|
| Alt+Shift+C | Convert the active page |
| Alt+Shift+S | Convert the current selection |
| Alt+Shift+M | Open preview |

Permissions: `activeTab`, `scripting`, `contextMenus`, `storage`, `clipboardWrite`.

There are no `host_permissions` and no content script; conversion runs in the extension context on demand.

## Why this exists

| Tool | Binary/CLI | MCP server | Real token counts | Heading-aware chunks | Selection mode | Offline extension |
|------|------------|------------|-------------------|----------------------|----------------|-------------------|
| markdownload | — | — | — | — | yes | yes |
| markdowner | — | — | — | — | — | yes |
| MD-This-Page | — | — | — | — | — | yes |
| cpdown | — | — | — | — | — | — |
| mdz | yes | yes | yes | yes | yes | yes |

## Development

```bash
bun install
bun test
bunx tsc -b
bun run build:cli
cd apps/extension && bun run build --target=chrome-mv3
```

## License

MIT — see [LICENSE](LICENSE).
