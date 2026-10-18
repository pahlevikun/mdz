import { countTokens } from "./tokens";
import { slugify } from "./outline";
import type { Chunk, ModelProfile } from "./types";

interface Line { i: number; text: string; level: number }

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function scan(markdown: string): Line[] {
  const lines: Line[] = [];
  let inFence = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) { inFence = !inFence; lines.push({ i, text, level: 0 }); return; }
    const m = inFence ? null : text.match(HEADING);
    lines.push({ i, text, level: m ? m[1]!.length : 0 });
  });
  return lines;
}

function splitOnDeepHeadings(text: string): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let buf: string[] = [];
  let sectionLevel = 0;
  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      const lv = m[1]!.length;
      if (buf.length === 0) {
        sectionLevel = lv;
        buf.push(line);
        continue;
      }
      if (lv > 2 && lv > sectionLevel) {
        chunks.push(buf.join("\n").trim());
        buf = [line];
        sectionLevel = lv;
        continue;
      }
    }
    buf.push(line);
  }
  if (buf.length) chunks.push(buf.join("\n").trim());
  return chunks.length ? chunks : [text];
}

export function buildChunks(
  markdown: string, budget = 8000, model: ModelProfile = "o200k"
): Chunk[] {
  const lines = scan(markdown);
  const out: Chunk[] = [];
  const seq: string[] = [];

  // Section boundaries: every heading of level 1-2 starts a new block.
  let start = 0;
  const bounds: number[] = [];
  lines.forEach((l) => { if (l.level >= 1 && l.level <= 2) bounds.push(l.i); });
  if (bounds.length === 0 || bounds[0] !== 0) bounds.unshift(0);
  const sections: Array<[number, number]> = bounds.map((b, k) =>
    [b, (bounds[k + 1] ?? lines.length) - 1]);

  for (const [s, e] of sections) {
    const text = lines.slice(s, e + 1).map(l => l.text).join("\n").trim();
    if (!text) continue;
    if (countTokens(text, model) <= budget) {
      for (const part of splitOnDeepHeadings(text)) seq.push(part);
    } else {
      // split the oversized section on paragraph boundaries
      const paras = text.split(/\n{2,}/);
      let buf: string[] = [];
      for (const p of paras) {
        const candidate = [...buf, p].join("\n\n");
        if (buf.length && countTokens(candidate, model) > budget) {
          seq.push(buf.join("\n\n"));
          buf = [p];
        } else buf.push(p);
      }
      if (buf.length) seq.push(buf.join("\n\n"));
    }
  }

  // Rebuild with exact line ranges by walking the original markdown once.
  let cursor = 0;
  const flat = markdown.split("\n");
  seq.forEach((chunkMd, idx) => {
    const firstLine = chunkMd.split("\n")[0]!;
    let found = -1;
    for (let i = cursor; i < flat.length; i++) {
      if (flat[i] === firstLine) { found = i; break; }
    }
    if (found === -1) found = cursor;
    const end = found + chunkMd.split("\n").length - 1;
    cursor = end + 1;

    const headingLine = chunkMd.split("\n")[0]!;
    const hm = headingLine.match(HEADING);
    const level = hm ? hm[1]!.length : 0;
    const title = hm ? hm[2]!.replace(/[*_`]/g, "").trim() : `Part ${idx + 1}`;

    // ancestor path: nearest preceding headings in the original doc
    const path: string[] = [];
    for (let i = found - 1; i >= 0; i--) {
      const m = flat[i]!.match(HEADING);
      if (!m) continue;
      const lv = m[1]!.length;
      if (lv < level && !path.some(p => p === m[2]!.replace(/[*_`]/g, "").trim())) {
        path.unshift(m[2]!.replace(/[*_`]/g, "").trim());
        if (lv === 1) break;
      }
    }

    out.push({
      id: `${String(idx + 1).padStart(2, "0")}-${slugify(title)}`,
      title, level, path,
      tokens: countTokens(chunkMd, model),
      words: chunkMd.split(/\s+/).filter(Boolean).length,
      startLine: found + 1,
      endLine: end + 1,
      markdown: chunkMd
    });
  });

  return out;
}
