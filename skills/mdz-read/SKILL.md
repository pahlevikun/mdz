---
name: mdz-read
description: "Read long web pages through the mdz MCP server: outline first, then chunk by chunk, so context never blows up. Use when a URL is a long article, docs page, changelog or reference and the agent needs its content; when a fetch returns HTML soup, nav bars or cookie banners; when only part of a page matters; or when the user asks for a page as markdown, an outline, chunks, DESIGN.md tokens, or a site tree. Not for short pages where a plain fetch already returns clean text."
version: 1.0.0
author: Farhan Yuda Pahlevi
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [markdown, mcp, web, reading, chunks, tokens]
    related_skills: []
---

# Read a page through mdz

`mdz` converts a page to markdown, cuts it by heading, and counts real tokens.
Used through MCP it costs one outline call before you spend context on content.

Order matters: **outline → pick chunks → read those chunks.** Reading the whole
page first is how a 40k-token docs page eats a session.

## Tools

Five tools, all take `url`:

| Tool | Args | Returns |
|---|---|---|
| `mdz_outline` | `url` | title, url, o200k total, chunk count, then one line per chunk: `id \| tokens \| title` |
| `mdz_read` | `url`, `chunk?`, `max_tokens?` | with `chunk`: that chunk's markdown. Without: chunk 1 plus a comment listing the remaining ids |
| `mdz_json` | `url` | full manifest: frontmatter fields, outline tree, chunk metadata, and `md` |
| `mdz_split` | `url`, `dir?` | writes one `.md` per chunk plus `index.json` to disk |
| `mdz_design_tokens` | `url` | `DESIGN.md` YAML frontmatter derived from the page's declared styles |

Chunk ids look like `01-install`, `02-usage` — derived from headings, stable
across calls on the same page.

## Read a long page

1. `mdz_outline({url})` — see the size and the section list. Costs a few hundred
   tokens.
2. Decide which chunk ids the question needs. Usually one or two.
3. `mdz_read({url, chunk: "<id>"})` for each. If a chunk is huge, pass
   `max_tokens` to get a shorter one.
4. Answer from those chunks. Only read more if the answer is not there.

For a page under roughly 2,000 tokens, `mdz_read` without `chunk` returns
everything that matters in one call. Do that instead of stepping through.

## Whole page, on purpose

- `mdz_json` when you need the structure, not the prose: outline tree, chunk
  boundaries, token counts, extractor name, warnings.
- `mdz_split` when the user wants files on disk. It writes and returns the path;
  it does not echo the content, so it costs almost no context.
- `mdz_read` with no `chunk` when the page is short and you only need the body.

## Design tokens

`mdz_design_tokens({url})` returns YAML frontmatter shaped for a `DESIGN.md`
file: `colors`, `typography`, `spacing`, `rounded`, plus a sample count and any
warnings.

Read the warnings. They are not decoration:

- fewer than two distinct colors → `primary` or `secondary` is missing, not
  guessed. Say so instead of filling it in.
- the output names how many color and font samples it used. If that number is
  low, the page is styled by external CSS and the tokens describe almost nothing.
  Tell the user that, and suggest the browser extension's Design tokens button,
  which samples the laid-out DOM instead of declared styles.

Never present derived tokens as the site's official palette.

## When mdz is the wrong tool

- The page needs a login, or the content only exists after JS runs: mdz fetches
  over HTTP and does not execute scripts. Say so; do not guess the content.
- The page is a PDF or an image: mdz rejects non-HTML content types.
- The user wants a search result or a live price: that is a different call, not a
  conversion.

## If a tool fails

| Symptom | Cause | Do |
|---|---|---|
| `isError: true` with `unknown chunk "x". valid: ...` | wrong id | Use an id from the outline call |
| `mdz_read` returns an empty text block | extracted nothing: blocked page, JS-only shell, or a non-HTML URL | Tell the user; do not fill the gap with memory |
| outline says `tokens: 0`, `chunks: 0` | the fetch got a bot wall or an empty shell, not the page | Treat as failure, not as a short page |
| title like `Just a moment...` or `Wikimedia Error` | bot challenge or block page | Report the block; suggest the extension's selection mode |
| `mdz_design_tokens` says `sampled: 0 declared color sample(s)` | the page is styled by external CSS only | Say the tokens describe nothing; offer the extension's Design tokens button, which samples the laid-out DOM |
| very low `words` with `extractor: defuddle` | page hid its body from parsers | Fall back to selection mode or ask for the text |

A blocked page is not a short page. `tokens: 0` and an empty read both mean the
conversion failed, and saying so is the correct answer.

## Verify before you answer

- The chunk ids you cite came from a real `mdz_outline` call, not from memory.
- If you quote a token count, it came from the tool, not an estimate.
- If a section was skipped, say which chunks you read.

## Install, when it is missing

```bash
curl -fsSL https://github.com/pahlevikun/mdz/releases/latest/download/mdz-linux-x64 -o mdz && chmod +x mdz
# darwin-arm64, darwin-x64, windows-x64.exe also published
```

MCP client entry:

```json
{ "mcpServers": { "mdz": { "command": "mdz-mcp" } } }
```

The CLI does the same work without MCP: `mdz <url>`, `--json`, `--split <dir>`,
`--crawl <depth>`, `--out <file>`.
