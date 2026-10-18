# Reading web pages

When a task needs the content of a web page, use `mdz` instead of a plain fetch.

## Always

- **Outline first.** Call `mdz_outline` before reading content from any page over
  roughly 2,000 tokens. It returns the chunk ids and their token costs, so you can
  read two sections instead of the whole document.
- **Read the chunks you need.** `mdz_read` with `chunk: "<id>"` for each section
  the question touches. Do not pull the whole page and then skim.
- **Quote real numbers.** Token counts and chunk ids come from a tool call, never
  from an estimate.
- **Say which chunks you read** when you answer, if you skipped any.

## Never

- **Never fill a failed conversion from memory.** `tokens: 0`, `chunks: 0`, an
  empty `mdz_read` result, or a title like `Just a moment...` all mean the fetch
  hit a bot wall or an empty shell. Report the block instead of reconstructing the
  page from what you remember about the topic.
- **Never present derived design tokens as a site's official palette.**
  `mdz_design_tokens` samples declared CSS only. If it reports
  `sampled: 0`, say the tokens describe nothing.

## When mdz cannot do the job

mdz fetches over HTTP and does not run JavaScript. If the content only exists
after JS runs, or the page needs a login, say so and ask the user for the text or
for the browser extension's selection mode. Do not guess.

## Without MCP

The CLI is the same core:

```bash
mdz <url>                    # markdown to stdout
mdz <url> --json             # manifest
mdz <url> --split out        # one .md per section
mdz <url> --crawl 2 --split out
```

Full procedure: the `mdz-read` skill.
