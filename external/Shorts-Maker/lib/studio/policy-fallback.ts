import { Buffer } from "node:buffer";

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toFallbackImageDataUrl(title: string, text: string, salt = ""): string {
  const safeTitle = escapeSvgText((title || "AI IMAGE").trim().slice(0, 36) || "AI IMAGE");
  const safeBody = escapeSvgText((text || "Image generation fallback").trim().slice(0, 64) || "Image generation fallback");
  const safeSalt = escapeSvgText(salt.trim().slice(0, 96));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
${safeSalt ? `<!-- ${safeSalt} -->` : ""}
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#eff6ff"/>
    <stop offset="100%" stop-color="#dbeafe"/>
  </linearGradient>
</defs>
<rect width="1080" height="1920" fill="url(#bg)"/>
<circle cx="820" cy="360" r="180" fill="#93c5fd" opacity="0.18"/>
<rect x="96" y="220" width="888" height="1480" rx="28" fill="#ffffff" stroke="#bfdbfe" stroke-width="4"/>
<text x="140" y="360" fill="#2563eb" font-size="42" font-family="Pretendard, sans-serif" font-weight="700">Image Fallback</text>
<text x="140" y="460" fill="#0f172a" font-size="58" font-family="Pretendard, sans-serif" font-weight="800">${safeTitle}</text>
<text x="140" y="560" fill="#475569" font-size="36" font-family="Pretendard, sans-serif">${safeBody}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
