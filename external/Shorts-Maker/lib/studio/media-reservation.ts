import { deriveGiphyGifUrl, unwrapStudioImageProxyUrl } from "@/lib/studio/media-url-utils";

function dedupeValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function toCanonicalReservationKey(rawValue: string): string {
  const value = unwrapStudioImageProxyUrl(rawValue).trim();
  if (!value) return "";
  const giphyGifUrl = deriveGiphyGifUrl(value);
  const target = giphyGifUrl || value;
  const giphyMatch =
    target.match(/\/media\/([A-Za-z0-9]+)\//i) ||
    target.match(/\/gifs\/(?:.+-)?([A-Za-z0-9]+)$/i);
  if (giphyMatch?.[1]) {
    return `giphy:${giphyMatch[1].toLowerCase()}`;
  }
  if (!/^https?:\/\//i.test(target)) {
    return target.toLowerCase();
  }
  try {
    const parsed = new URL(target);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return target.toLowerCase();
  }
}

export function buildMediaReservationKeys(values: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value) continue;
    keys.push(value);
    const unwrapped = unwrapStudioImageProxyUrl(value);
    if (unwrapped && unwrapped !== value) keys.push(unwrapped);
    const canonical = toCanonicalReservationKey(value);
    if (canonical) keys.push(canonical);
  }
  return dedupeValues(keys);
}

export function hasExcludedMediaReservationMatch(
  values: Array<string | null | undefined>,
  excludedUrls: Iterable<string>
): boolean {
  const excludedKeys = new Set(buildMediaReservationKeys(Array.from(excludedUrls)));
  const candidateKeys = buildMediaReservationKeys(values);
  return candidateKeys.some((value) => excludedKeys.has(value));
}
