import { normalizeStudioImageProxyUpstreamUrl } from "@/lib/studio/image-proxy-shared";

export function toImageProxyUrl(raw: string): string | null {
  const trimmed = normalizeStudioImageProxyUpstreamUrl(raw);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `/api/studio/image-proxy?url=${encodeURIComponent(url.toString())}`;
  } catch {
    return null;
  }
}
