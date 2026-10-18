type Val = string | number | boolean | string[];

function scalar(v: string | number | boolean): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === "") return '""';
  const needsQuote = /^[\s>|*&!%@`#-]|: |\s$/.test(v) || /^(true|false|null|~)$/i.test(v);
  return needsQuote ? JSON.stringify(v) : v;
}

export function toFrontmatter(fields: Record<string, Val | undefined>): string {
  const out: string[] = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${k}: []`);
      else { out.push(`${k}:`); for (const item of v) out.push(`  - ${scalar(item)}`); }
    } else out.push(`${k}: ${scalar(v)}`);
  }
  out.push("---");
  return out.join("\n");
}
