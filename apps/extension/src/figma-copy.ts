export interface CopyPayload {
  figmaHtml: string;
  markdown: string;
  pngDataUrl?: string;
}

export function buildClipboardItemParts(p: CopyPayload): {
  html: string;
  text: string;
  png: boolean;
} {
  return {
    html: p.figmaHtml,
    text: p.markdown,
    png: Boolean(p.pngDataUrl),
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function copyForFigma(p: CopyPayload): Promise<void> {
  const parts = buildClipboardItemParts(p);
  const item: Record<string, Blob> = {
    "text/html": new Blob([parts.html], { type: "text/html" }),
    "text/plain": new Blob([parts.text], { type: "text/plain" }),
  };
  if (parts.png && p.pngDataUrl) {
    item["image/png"] = dataUrlToBlob(p.pngDataUrl);
  }
  await navigator.clipboard.write([new ClipboardItem(item)]);
}
