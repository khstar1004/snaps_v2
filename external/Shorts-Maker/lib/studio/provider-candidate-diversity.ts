import { inferGiphyReactionFamily, normalizeGiphySearchQuery } from "@/lib/studio/giphy-query-utils";
import { buildMediaReservationKeys } from "@/lib/studio/media-reservation";
import type { ImageProviderId, SlideMediaKind } from "@/types/studio-json";

type ScoredCandidateLike = {
  score: number;
};

export type SelectionNoveltySignals = {
  reactionFamily?: string;
  mediaIdentity?: string;
  sourceIdentity?: string;
  queryRoot?: string;
};

export type SelectionNoveltyHistory = {
  media: Map<string, number>;
  source: Map<string, number>;
  family: Map<string, number>;
  queryRoot: Map<string, number>;
};

export type CandidateNoveltyInput = {
  provider?: ImageProviderId | string;
  id?: string;
  url?: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind | string;
  pageUrl?: string;
  title?: string;
  query?: string;
  queryCandidates?: string[];
  sourceMetadata?: {
    providerQuery?: string;
    providerTitle?: string;
    providerSlug?: string;
    providerTags?: string[];
    reactionFamily?: string;
    queryRoot?: string;
  };
};

export type NoveltyAdjustedScoredCandidate<T extends ScoredCandidateLike> = T & {
  effectiveScore: number;
  noveltyPenalty: number;
  noveltySignals: SelectionNoveltySignals;
  noveltyTags: string[];
};

const QUERY_ROOT_STOPWORDS = new Set([
  "reaction",
  "meme",
  "gif",
  "gifs",
  "face",
  "photo",
  "photos",
  "image",
  "images",
  "scene",
  "scenes",
  "picture",
  "pictures",
  "짤",
  "움짤",
  "표정",
  "사진",
  "이미지",
  "현장",
  "밈",
  "움직이는",
]);

const RECENT_HISTORY_WEIGHTS = {
  media: 120,
  source: 90,
  family: 18,
  queryRoot: 12,
} as const;

const INTRA_POOL_WEIGHTS = {
  media: 40,
  source: 28,
  family: 10,
  queryRoot: 6,
} as const;

function normalizeCompact(value: unknown): string {
  return String(value || "").trim();
}

function dedupeStrings(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = normalizeCompact(value);
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function pickCanonicalReservationIdentity(values: Array<string | null | undefined>): string {
  const keys = buildMediaReservationKeys(values)
    .map((value) => value.trim())
    .filter(Boolean);
  if (keys.length <= 0) return "";
  return (
    keys.find((value) => value.startsWith("giphy:")) ||
    keys.find((value) => /^https?:\/\//i.test(value) && !/[?#]/.test(value)) ||
    keys[keys.length - 1] ||
    ""
  );
}

function normalizeQueryRootValue(value: string): string {
  const compact = normalizeCompact(value);
  if (!compact) return "";
  const normalizedGiphy = normalizeGiphySearchQuery(compact);
  const base =
    normalizedGiphy && /[a-z]/i.test(normalizedGiphy)
      ? normalizedGiphy
      : compact.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!base) return "";
  const tokens = base
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !QUERY_ROOT_STOPWORDS.has(token));
  if (tokens.length <= 0) return base;
  return tokens.slice(0, 3).join(" ").trim();
}

function readHistoryCount(values: Map<string, number>, key: string | undefined): number {
  if (!key) return 0;
  return values.get(key) || 0;
}

function incrementHistoryCount(values: Map<string, number>, key: string | undefined): void {
  if (!key) return;
  values.set(key, (values.get(key) || 0) + 1);
}

function copyHistoryCounts(source?: Map<string, number>): Map<string, number> {
  const next = new Map<string, number>();
  for (const [key, value] of source || []) {
    const compact = normalizeCompact(key);
    if (!compact) continue;
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) continue;
    next.set(compact, Math.floor(count));
  }
  return next;
}

function isSelectionNoveltySignals(value: unknown): value is SelectionNoveltySignals {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.mediaIdentity === "string" ||
    typeof row.sourceIdentity === "string" ||
    typeof row.queryRoot === "string" ||
    typeof row.reactionFamily === "string"
  );
}

export function normalizeSelectionOffset(selectionOffset: number | undefined, length: number): number {
  if (!Number.isFinite(selectionOffset) || length <= 0) return 0;
  const normalized = Math.floor(Number(selectionOffset)) % length;
  return normalized >= 0 ? normalized : normalized + length;
}

export function rotateCandidatesByOffset<T>(items: T[], selectionOffset?: number): T[] {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items.slice() : [];
  const offset = normalizeSelectionOffset(selectionOffset, items.length);
  if (offset === 0) return items.slice();
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function diversifyScoredCandidates<T extends ScoredCandidateLike>(
  items: T[],
  options?: {
    selectionOffset?: number;
    maxPoolSize?: number;
    scoreWindow?: number;
  }
): T[] {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items.slice() : [];
  const maxPoolSize = Math.max(1, Math.min(items.length, Math.floor(options?.maxPoolSize || 3)));
  const scoreWindow = Math.max(0, Number.isFinite(options?.scoreWindow) ? Number(options?.scoreWindow) : 6);
  const bestScore = Number.isFinite(items[0]?.score) ? Number(items[0].score) : 0;
  const eligiblePool = items
    .slice(0, maxPoolSize)
    .filter((item) => Number.isFinite(item.score) && item.score >= bestScore - scoreWindow);
  const poolSize = Math.max(1, eligiblePool.length > 0 ? eligiblePool.length : Math.min(maxPoolSize, items.length));
  const rotatedPool = rotateCandidatesByOffset(items.slice(0, poolSize), options?.selectionOffset);
  return [...rotatedPool, ...items.slice(poolSize)];
}

export function createSelectionNoveltyHistory(): SelectionNoveltyHistory {
  return {
    media: new Map<string, number>(),
    source: new Map<string, number>(),
    family: new Map<string, number>(),
    queryRoot: new Map<string, number>(),
  };
}

export function cloneSelectionNoveltyHistory(history?: SelectionNoveltyHistory): SelectionNoveltyHistory {
  return {
    media: copyHistoryCounts(history?.media),
    source: copyHistoryCounts(history?.source),
    family: copyHistoryCounts(history?.family),
    queryRoot: copyHistoryCounts(history?.queryRoot),
  };
}

export function hasSelectionNoveltySignals(signals: SelectionNoveltySignals | undefined): boolean {
  if (!signals) return false;
  return Boolean(signals.mediaIdentity || signals.sourceIdentity || signals.queryRoot || signals.reactionFamily);
}

export function recordSelectionNovelty(history: SelectionNoveltyHistory, signals: SelectionNoveltySignals | undefined): void {
  if (!signals) return;
  incrementHistoryCount(history.media, signals.mediaIdentity);
  incrementHistoryCount(history.source, signals.sourceIdentity);
  incrementHistoryCount(history.family, signals.reactionFamily);
  incrementHistoryCount(history.queryRoot, signals.queryRoot);
}

export function buildSelectionNoveltyHistorySignature(history?: SelectionNoveltyHistory): string {
  if (!history) return "";
  const segments = [
    ...Array.from(history.media.entries()).map(([key, count]) => `media:${key}@${count}`),
    ...Array.from(history.source.entries()).map(([key, count]) => `source:${key}@${count}`),
    ...Array.from(history.family.entries()).map(([key, count]) => `family:${key}@${count}`),
    ...Array.from(history.queryRoot.entries()).map(([key, count]) => `query:${key}@${count}`),
  ]
    .filter(Boolean)
    .sort()
    .slice(0, 24);
  return segments.join("|");
}

export function buildCandidateNoveltySignals(input: CandidateNoveltyInput | SelectionNoveltySignals): SelectionNoveltySignals {
  if (isSelectionNoveltySignals(input)) {
    return {
      reactionFamily: normalizeCompact(input.reactionFamily) || undefined,
      mediaIdentity: normalizeCompact(input.mediaIdentity) || undefined,
      sourceIdentity: normalizeCompact(input.sourceIdentity) || undefined,
      queryRoot: normalizeCompact(input.queryRoot) || undefined,
    };
  }

  const sourceValues = dedupeStrings([
    input.query || "",
    ...(input.queryCandidates || []),
    input.sourceMetadata?.providerQuery || "",
    input.title || "",
    input.sourceMetadata?.providerTitle || "",
    input.sourceMetadata?.providerSlug || "",
    ...(input.sourceMetadata?.providerTags || []),
  ]);
  const reactionFamily =
    normalizeCompact(input.sourceMetadata?.reactionFamily) ||
    sourceValues
      .map((value) => inferGiphyReactionFamily(value))
      .find((value) => Boolean(value)) ||
    undefined;
  const queryRoot =
    normalizeCompact(input.sourceMetadata?.queryRoot) ||
    sourceValues.map((value) => normalizeQueryRootValue(value)).find(Boolean) ||
    undefined;
  const mediaIdentity =
    pickCanonicalReservationIdentity([
      input.mediaUrl,
      input.url,
      input.id ? `${normalizeCompact(input.provider || "candidate")}:${normalizeCompact(input.id)}` : "",
    ]) || undefined;
  const sourceIdentity =
    pickCanonicalReservationIdentity([
      input.pageUrl,
      input.sourceMetadata?.providerSlug ? `${normalizeCompact(input.provider || "provider")}:${normalizeCompact(input.sourceMetadata.providerSlug)}` : "",
      input.id ? `${normalizeCompact(input.provider || "candidate")}:${normalizeCompact(input.id)}` : "",
    ]) || undefined;

  return {
    reactionFamily,
    mediaIdentity,
    sourceIdentity,
    queryRoot,
  };
}

export function appendSelectionReasonTags(baseReason: string | undefined, tags: string[] | undefined): string {
  const uniqueTags = dedupeStrings(tags || []);
  const reason = normalizeCompact(baseReason);
  if (uniqueTags.length <= 0) return reason;
  return [reason, ...uniqueTags].filter(Boolean).join("; ");
}

function scoreNoveltyPenalty(
  signals: SelectionNoveltySignals,
  history: SelectionNoveltyHistory | undefined,
  selectedPool: SelectionNoveltyHistory
): { total: number; tags: string[] } {
  if (!hasSelectionNoveltySignals(signals)) {
    return { total: 0, tags: [] };
  }

  let total = 0;
  let sawRecentHistoryPenalty = false;
  const tags = new Set<string>();
  const applyPenalty = (
    key: string | undefined,
    recentValues: Map<string, number> | undefined,
    poolValues: Map<string, number>,
    recentWeight: number,
    poolWeight: number,
    tag: string
  ) => {
    if (!key) return;
    const recentCount = readHistoryCount(recentValues || new Map<string, number>(), key);
    const poolCount = readHistoryCount(poolValues, key);
    if (recentCount > 0) {
      total += recentWeight * recentCount;
      sawRecentHistoryPenalty = true;
      tags.add(tag);
    }
    if (poolCount > 0) {
      total += poolWeight * poolCount;
      tags.add(tag);
    }
  };

  applyPenalty(
    signals.mediaIdentity,
    history?.media,
    selectedPool.media,
    RECENT_HISTORY_WEIGHTS.media,
    INTRA_POOL_WEIGHTS.media,
    "media-identity-penalty"
  );
  applyPenalty(
    signals.sourceIdentity,
    history?.source,
    selectedPool.source,
    RECENT_HISTORY_WEIGHTS.source,
    INTRA_POOL_WEIGHTS.source,
    "source-duplicate-penalty"
  );
  applyPenalty(
    signals.reactionFamily,
    history?.family,
    selectedPool.family,
    RECENT_HISTORY_WEIGHTS.family,
    INTRA_POOL_WEIGHTS.family,
    "family-penalty"
  );
  applyPenalty(
    signals.queryRoot,
    history?.queryRoot,
    selectedPool.queryRoot,
    RECENT_HISTORY_WEIGHTS.queryRoot,
    INTRA_POOL_WEIGHTS.queryRoot,
    "query-root-penalty"
  );
  if (sawRecentHistoryPenalty) tags.add("recent-history-penalty");
  return {
    total,
    tags: Array.from(tags),
  };
}

export function diversifyNoveltyScoredCandidates<T extends ScoredCandidateLike>(
  items: T[],
  options: {
    getNoveltySignals: (item: T) => CandidateNoveltyInput | SelectionNoveltySignals;
    recentHistory?: SelectionNoveltyHistory;
    selectionOffset?: number;
    maxPoolSize?: number;
    scoreWindow?: number;
  }
): NoveltyAdjustedScoredCandidate<T>[] {
  if (!Array.isArray(items) || items.length <= 0) return [];
  const decorated = items.map((item) => ({
    item,
    noveltySignals: buildCandidateNoveltySignals(options.getNoveltySignals(item)),
  }));
  if (decorated.length === 1) {
    const only = decorated[0]!;
    return [
      {
        ...only.item,
        noveltySignals: only.noveltySignals,
        noveltyPenalty: 0,
        noveltyTags: [],
        effectiveScore: only.item.score,
      },
    ];
  }

  const maxPoolSize = Math.max(1, Math.min(decorated.length, Math.floor(options.maxPoolSize || 4)));
  const scoreWindow = Math.max(0, Number.isFinite(options.scoreWindow) ? Number(options.scoreWindow) : 8);
  const bestScore = Number.isFinite(decorated[0]?.item.score) ? Number(decorated[0].item.score) : 0;
  const poolSize = Math.max(
    1,
    decorated
      .slice(0, maxPoolSize)
      .filter(({ item }) => Number.isFinite(item.score) && item.score >= bestScore - scoreWindow).length || Math.min(maxPoolSize, decorated.length)
  );
  const remaining = decorated.slice(0, poolSize).map((row, index) => ({ ...row, index }));
  const rest = decorated.slice(poolSize).map(({ item, noveltySignals }) => ({
    ...item,
    noveltySignals,
    noveltyPenalty: 0,
    noveltyTags: [],
    effectiveScore: item.score,
  }));
  const selectedPool = createSelectionNoveltyHistory();
  const orderedPool: NoveltyAdjustedScoredCandidate<T>[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestCandidate: NoveltyAdjustedScoredCandidate<T> | null = null;

    for (let index = 0; index < remaining.length; index += 1) {
      const current = remaining[index]!;
      const penalty = scoreNoveltyPenalty(current.noveltySignals, options.recentHistory, selectedPool);
      const effectiveScore = Number(current.item.score || 0) - penalty.total;
      const candidate: NoveltyAdjustedScoredCandidate<T> = {
        ...current.item,
        noveltySignals: current.noveltySignals,
        noveltyPenalty: penalty.total,
        noveltyTags: penalty.tags,
        effectiveScore,
      };
      if (
        !bestCandidate ||
        candidate.effectiveScore > bestCandidate.effectiveScore ||
        (candidate.effectiveScore === bestCandidate.effectiveScore && candidate.score > bestCandidate.score) ||
        (candidate.effectiveScore === bestCandidate.effectiveScore &&
          candidate.score === bestCandidate.score &&
          current.index < remaining[bestIndex]!.index)
      ) {
        bestCandidate = candidate;
        bestIndex = index;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    if (!bestCandidate || !selected) continue;
    recordSelectionNovelty(selectedPool, selected.noveltySignals);
    orderedPool.push(bestCandidate);
  }

  const rotatedPool = rotateCandidatesByOffset(orderedPool, options.selectionOffset);
  return [...rotatedPool, ...rest];
}
