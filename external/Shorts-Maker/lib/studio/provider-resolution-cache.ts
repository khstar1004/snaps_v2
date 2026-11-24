import { buildMediaReservationKeys } from "@/lib/studio/media-reservation";
import type { ImageProviderId } from "@/types/studio-json";

export function buildProviderResolutionCacheKey(input: {
  providers: ImageProviderId[];
  query: string;
  scene: string;
  mustAvoid: string[];
  sort: "sim" | "date";
  minScore: number;
  intent: "news" | "meme";
  crawlMode: "auto" | "fun" | "stock";
  noFilter: boolean;
  excludeCandidateIds?: string[];
  excludeUrls?: string[];
  selectionOffset?: number;
  historySignature?: string;
}): string {
  return JSON.stringify({
    providers: input.providers,
    query: input.query,
    scene: input.scene,
    mustAvoid: input.mustAvoid,
    sort: input.sort,
    minScore: input.minScore,
    intent: input.intent,
    crawlMode: input.crawlMode,
    noFilter: input.noFilter,
    selectionOffset: Number.isFinite(input.selectionOffset) ? Math.floor(Number(input.selectionOffset)) : 0,
    historySignature: String(input.historySignature || "").trim(),
    excludeCandidateIds: Array.from(
      new Set((input.excludeCandidateIds || []).map((value) => value.trim()).filter(Boolean))
    ).sort(),
    excludeUrls: buildMediaReservationKeys(input.excludeUrls || []).sort(),
  });
}
