export function renderMarkdownHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inl = (s: string) =>
    s.replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
        /^javascript:/i.test(u) ? t : `<a href="${u}" rel='noreferrer noopener' target='_blank'>${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const lines = esc(md).split("\n");
  const out: string[] = [];
  const para: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inl(para.join(" "))}</p>`); para.length = 0; }
  };
  for (let i = 0; i < lines.length; ) {
    const L = lines[i]!;
    if (L === "") { flush(); i++; continue; }
    if (/^```/.test(L)) {
      flush(); i++; const buf: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i]!)) buf.push(lines[i++]!);
      if (i < lines.length) i++;
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }
    const hm = L.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { flush(); out.push(`<h${hm[1]!.length}>${inl(hm[2]!)}</h${hm[1]!.length}>`); i++; continue; }
    if (L === "---" || L === "***") { flush(); out.push("<hr>"); i++; continue; }
    if (/^> /.test(L)) {
      flush(); const qs: string[] = [];
      while (i < lines.length && /^> /.test(lines[i]!)) qs.push(lines[i++]!.slice(2));
      out.push(`<blockquote><p>${inl(qs.join(" "))}</p></blockquote>`);
      continue;
    }
    let m = L.match(/^[-*] (.*)$/);
    if (m) {
      flush(); const items = [m[1]!];
      for (i++; i < lines.length && (m = lines[i]!.match(/^[-*] (.*)$/)); i++) items.push(m[1]!);
      out.push(`<ul>${items.map((li) => `<li>${inl(li)}</li>`).join("")}</ul>`);
      continue;
    }
    m = L.match(/^\d+\. (.*)$/);
    if (m) {
      flush(); const items = [m[1]!];
      for (i++; i < lines.length && (m = lines[i]!.match(/^\d+\. (.*)$/)); i++) items.push(m[1]!);
      out.push(`<ol>${items.map((li) => `<li>${inl(li)}</li>`).join("")}</ol>`);
      continue;
    }
    para.push(L); i++;
  }
  flush();
  return out.join("");
}
