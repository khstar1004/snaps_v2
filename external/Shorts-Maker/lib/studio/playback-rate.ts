export const STUDIO_PLAYBACK_RATE_MIN = 0.8;
export const STUDIO_PLAYBACK_RATE_MAX = 3;
export const DEFAULT_STUDIO_PLAYBACK_RATE = 1.5;

export function normalizeStudioPlaybackRate(
  value: unknown,
  fallback = DEFAULT_STUDIO_PLAYBACK_RATE
): number {
  if (value === null || typeof value === "undefined" || (typeof value === "string" && !value.trim())) {
    return normalizeStudioPlaybackRateFallback(fallback);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return normalizeStudioPlaybackRateFallback(fallback);
  return Math.max(STUDIO_PLAYBACK_RATE_MIN, Math.min(STUDIO_PLAYBACK_RATE_MAX, parsed));
}

function normalizeStudioPlaybackRateFallback(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STUDIO_PLAYBACK_RATE;
  return Math.max(STUDIO_PLAYBACK_RATE_MIN, Math.min(STUDIO_PLAYBACK_RATE_MAX, value));
}
