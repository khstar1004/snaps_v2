export const STUDIO_IMAGE_PROXY_PATHNAME = "/api/studio/image-proxy";
export const STUDIO_IMAGE_PROXY_REDIRECT_LIMIT = 3;
export const STUDIO_IMAGE_PROXY_MAX_BYTES = 12 * 1024 * 1024;

const NAVER_REFERER = "https://search.naver.com/";
const NAVER_ORIGIN = "https://search.naver.com";
const CBOARD_REFERER = "https://cboard.net/";
const CBOARD_ORIGIN = "https://cboard.net";

function resolveNestedImageSourceUrl(raw: string): string {
  let next = String(raw || "").trim();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!next) return "";
    try {
      return new URL(next).toString();
    } catch {
      try {
        const decoded = decodeURIComponent(next);
        if (!decoded || decoded === next) return "";
        next = decoded.trim();
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function normalizeStudioImageProxyUpstreamUrl(raw: string): string {
  let current = resolveNestedImageSourceUrl(raw);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!current) return "";
    try {
      const parsed = new URL(current);
      const nestedImageUrl =
        parsed.hostname === "img-api.cboard.net" && /\/img_n\.php$/i.test(parsed.pathname)
          ? resolveNestedImageSourceUrl(parsed.searchParams.get("image_url") || parsed.searchParams.get("url") || "")
          : "";
      if (!nestedImageUrl) return parsed.toString();
      current = nestedImageUrl;
    } catch {
      return "";
    }
  }
  return current;
}

export function buildStudioImageProxyUpstreamHeaders(url: URL): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Sec-Fetch-Dest": "image",
  };
  if (url.hostname.endsWith(".pstatic.net") || url.hostname.endsWith(".naver.net") || url.hostname === "news.naver.com") {
    headers.Referer = NAVER_REFERER;
    headers.Origin = NAVER_ORIGIN;
  }
  if (url.hostname === "img-api.cboard.net") {
    headers.Referer = CBOARD_REFERER;
    headers.Origin = CBOARD_ORIGIN;
  }
  if (url.hostname.endsWith(".yna.co.kr") || url.hostname === "yna.co.kr") {
    headers.Referer = "https://www.yna.co.kr/";
    headers.Origin = "https://www.yna.co.kr";
  }
  return headers;
}

export function parseStudioImageProxyTarget(rawUrl: string): URL | null {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized, "http://localhost");
    if (parsed.pathname !== STUDIO_IMAGE_PROXY_PATHNAME) return null;
    const upstreamRaw = normalizeStudioImageProxyUpstreamUrl(parsed.searchParams.get("url") || "");
    return upstreamRaw ? new URL(upstreamRaw) : null;
  } catch {
    return null;
  }
}
