import { inferGiphyReactionFamily, isGiphySearchableQuery, normalizeGiphySearchQuery } from "@/lib/studio/giphy-query-utils";
import { analyzeImageRequestSearchSignal } from "@/lib/studio/images/intent";
import type { ImageRequest, SlideInput, StudioPrepareRequest } from "@/types/studio-json";

type PlannedProviderHint = NonNullable<ImageRequest["preferredProviders"]>[number];

type PlannerHelpers = {
  normalizeWhitespace: (value: string) => string;
  toFallbackImageRequest: (
    slide: SlideInput,
    crawlMode?: StudioPrepareRequest["crawlMode"],
    provider?: PlannedProviderHint
  ) => ImageRequest;
  toSearchableQueryCandidates: (
    input: string[],
    scene: string,
    slide: SlideInput,
    fallback: ImageRequest,
    crawlMode?: StudioPrepareRequest["crawlMode"],
    provider?: PlannedProviderHint,
    plannerSource?: ImageRequest["plannerSource"]
  ) => string[];
};

type SelectionPolicyInput = {
  slides: SlideInput[];
  crawlMode?: StudioPrepareRequest["crawlMode"];
  debug?: boolean;
  helpers: PlannerHelpers;
};

type SegmentRequestDraft = {
  beatId: string;
  startLineIndex: number;
  request: ImageRequest;
  fallbackRequest: ImageRequest;
  imageUrl?: string;
  reason?: string;
  debugTags: string[];
};

type SlidePolicyDraft = {
  slide: SlideInput;
  slideIndex: number;
  requests: SegmentRequestDraft[];
  forcedFourLineSplit: boolean;
};

function dedupeValues(values: string[], normalizeWhitespace: (value: string) => string): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = normalizeWhitespace(value);
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

function isEnglishLikeQuery(value: string, normalizeWhitespace: (value: string) => string): boolean {
  const compact = normalizeWhitespace(value);
  if (!compact) return false;
  if (/[가-힣]/u.test(compact)) return false;
  return /[a-z]/i.test(compact);
}

function inferProviderFromCandidates(
  candidates: string[],
  scene: string,
  normalizeWhitespace: (value: string) => string
): PlannedProviderHint | undefined {
  const normalizedCandidates = dedupeValues([...candidates, scene], normalizeWhitespace);
  if (normalizedCandidates.length <= 0) return undefined;
  const giphyCandidates = normalizedCandidates
    .map((value) => normalizeGiphySearchQuery(value))
    .filter(isGiphySearchableQuery);
  const signal = analyzeImageRequestSearchSignal({
    query: candidates[0] || scene,
    queryCandidates: candidates.slice(1),
    scene,
  });
  if (giphyCandidates.length > 0 && (signal.hasReactionCue || !signal.hasConcreteVisualCue)) return "giphy";
  if (signal.hasConcreteVisualCue && !signal.hasReactionCue) return "naver";
  if (normalizedCandidates.some((candidate) => /[가-힣]/u.test(candidate))) return "naver";
  if (giphyCandidates.length > 0) return "giphy";
  if (normalizedCandidates.some((candidate) => isEnglishLikeQuery(candidate, normalizeWhitespace))) return "giphy";
  return undefined;
}

function inferProviderFromRequest(
  request: ImageRequest | undefined,
  normalizeWhitespace: (value: string) => string
): PlannedProviderHint | undefined {
  const preferred = request?.preferredProviders?.[0];
  if (preferred === "giphy" || preferred === "naver") return preferred;
  const candidates = [request?.query || "", ...(request?.queryCandidates || [])].map((value) => normalizeWhitespace(value)).filter(Boolean);
  return inferProviderFromCandidates(candidates, normalizeWhitespace(request?.scene || ""), normalizeWhitespace);
}

function shouldPreserveCodexCandidates(
  request: ImageRequest | undefined,
  normalizeWhitespace: (value: string) => string
): boolean {
  if (request?.plannerSource === "codex") return true;
  if (request?.plannerSource !== "heuristic") return false;
  const candidates = [request.query || "", ...(request.queryCandidates || [])];
  return candidates.some((candidate) => isEnglishLikeQuery(candidate, normalizeWhitespace));
}

function buildRequestSignature(
  request: Pick<ImageRequest, "query" | "scene" | "people" | "preferredProviders">,
  normalizeWhitespace: (value: string) => string
): string {
  const corpus = dedupeValues(
    [request.query || "", request.scene || "", ...(request.people || []), ...(request.preferredProviders || [])].flatMap(
      (value) => tokenize(value)
    ),
    normalizeWhitespace
  );
  if (corpus.length > 0) return corpus.join("|");
  return normalizeWhitespace(
    [request.query || "", request.scene || "", ...(request.preferredProviders || [])].join(" ").toLowerCase()
  );
}

function dedupeGiphyCandidateFamilies(
  values: string[],
  normalizeWhitespace: (value: string) => string
): string[] {
  const deduped: string[] = [];
  const seenQueries = new Set<string>();
  const seenFamilies = new Set<string>();
  for (const value of values) {
    const compact = normalizeWhitespace(value);
    if (!compact) continue;
    const normalizedQuery = normalizeGiphySearchQuery(compact) || compact.toLowerCase();
    if (seenQueries.has(normalizedQuery)) continue;
    const family = inferGiphyReactionFamily(normalizedQuery);
    if (family && seenFamilies.has(family)) continue;
    seenQueries.add(normalizedQuery);
    if (family) seenFamilies.add(family);
    deduped.push(compact);
  }
  return deduped;
}

function overlapRatio(left: string, right: string): number {
  if (!left || !right) return 0;
  const leftTokens = left.split("|").filter(Boolean);
  const rightTokens = right.split("|").filter(Boolean);
  if (leftTokens.length <= 0 || rightTokens.length <= 0) return left === right ? 1 : 0;
  const rightSet = new Set(rightTokens);
  let hits = 0;
  for (const token of leftTokens) {
    if (rightSet.has(token)) hits += 1;
  }
  return hits / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
}

function signaturesConflict(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return overlapRatio(left, right) >= 0.75;
}

function getNormalizedLines(
  slide: SlideInput,
  normalizeWhitespace: (value: string) => string
): string[] {
  const lines = Array.isArray(slide.lines)
    ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean)
    : [];
  if (lines.length > 0) return lines;
  const fallbackText = normalizeWhitespace(slide.text || "");
  return fallbackText ? [fallbackText] : ["상황 반응"];
}

function createSegmentSlide(
  slide: SlideInput,
  lines: string[],
  normalizeWhitespace: (value: string) => string
): SlideInput {
  const nextLines = lines.map((line) => normalizeWhitespace(line)).filter(Boolean);
  const nextText = normalizeWhitespace(nextLines.join(" ")) || normalizeWhitespace(slide.text || "") || "상황 반응";
  return {
    ...slide,
    text: nextText,
    lines: nextLines.length > 0 ? nextLines : [nextText],
    imageBeats: slide.imageBeats,
  };
}

function buildLineSegments(
  slide: SlideInput,
  normalizeWhitespace: (value: string) => string
): Array<{ startLineIndex: number; lines: string[] }> {
  const lines = getNormalizedLines(slide, normalizeWhitespace);
  return [{ startLineIndex: 0, lines }];
}

function getPrimaryImageBeat(slide: SlideInput): NonNullable<SlideInput["imageBeats"]>[number] | undefined {
  if (!Array.isArray(slide.imageBeats)) return undefined;
  return slide.imageBeats
    .filter((beat) => Number.isFinite(beat.startLineIndex) && beat.startLineIndex >= 0)
    .slice()
    .sort((left, right) => left.startLineIndex - right.startLineIndex)[0];
}

function mergeRequestWithFallback(
  request: ImageRequest | undefined,
  fallback: ImageRequest,
  segmentSlide: SlideInput,
  crawlMode: StudioPrepareRequest["crawlMode"] | undefined,
  helpers: PlannerHelpers,
  forcedProvider?: PlannedProviderHint
): ImageRequest {
  const scene = helpers.normalizeWhitespace(request?.scene || fallback.scene || "") || fallback.scene || "상황 반응";
  const originalProvider = request?.preferredProviders?.[0];
  const preferredProviders =
    forcedProvider
      ? [forcedProvider]
      : Array.isArray(request?.preferredProviders) && request.preferredProviders.length > 0
      ? request.preferredProviders
      : fallback.preferredProviders;
  const preserveCodexCandidates =
    (!forcedProvider || !originalProvider || originalProvider === forcedProvider) &&
    shouldPreserveCodexCandidates(request, helpers.normalizeWhitespace);
  const querySeeds = dedupeValues(
    [
      request?.query || "",
      ...(request?.queryCandidates || []),
      ...(preserveCodexCandidates ? [] : [fallback.query || "", ...(fallback.queryCandidates || [])]),
    ],
    helpers.normalizeWhitespace
  );
  const queryCandidates = helpers.toSearchableQueryCandidates(
    querySeeds,
    scene,
    segmentSlide,
    fallback,
    crawlMode,
    preferredProviders?.[0],
    request?.plannerSource || fallback.plannerSource
  );
  return {
    query: queryCandidates[0] || fallback.query,
    queryCandidates,
    preferredProviders,
    people: dedupeValues([...(request?.people || []), ...(fallback.people || [])], helpers.normalizeWhitespace).slice(0, 3),
    scene,
    orientation: request?.orientation || fallback.orientation,
    mustAvoid: (request?.mustAvoid && request.mustAvoid.length > 0 ? request.mustAvoid : fallback.mustAvoid) || [],
    plannerSource: request?.plannerSource || fallback.plannerSource,
  };
}

function getRequestReuseScore(
  queryKey: string,
  signature: string,
  globalUsedQueries: Set<string>,
  localUsedQueries: Set<string>,
  globalUsed: Set<string>,
  localUsed: Set<string>
): { score: number; globalHit: boolean; localHit: boolean; exactGlobalHit: boolean; exactLocalHit: boolean } {
  const exactGlobalHit = globalUsedQueries.has(queryKey);
  const exactLocalHit = localUsedQueries.has(queryKey);
  const globalHit = Array.from(globalUsed).some((used) => signaturesConflict(signature, used));
  const localHit = Array.from(localUsed).some((used) => signaturesConflict(signature, used));
  return {
    score: (exactLocalHit ? 8 : 0) + (exactGlobalHit ? 5 : 0) + (localHit ? 4 : 0) + (globalHit ? 2 : 0),
    globalHit,
    localHit,
    exactGlobalHit,
    exactLocalHit,
  };
}

function chooseDistinctRequest(
  draft: SegmentRequestDraft,
  globalUsedQueries: Set<string>,
  localUsedQueries: Set<string>,
  globalUsed: Set<string>,
  localUsed: Set<string>,
  globalUsedFamilies: Set<string>,
  localUsedFamilies: Set<string>,
  previousGiphyFamily: string | undefined,
  helpers: PlannerHelpers
): {
  request: ImageRequest;
  signature: string;
  reason: string;
  family?: string;
} {
  const preservePrimaryCandidates = shouldPreserveCodexCandidates(draft.request, helpers.normalizeWhitespace);
  const requestProvider = inferProviderFromRequest(draft.request, helpers.normalizeWhitespace);
  const candidatePoolBase = dedupeValues(
    [
      draft.request.query || "",
      ...(draft.request.queryCandidates || []),
      ...(preservePrimaryCandidates ? [] : [draft.fallbackRequest.query || "", ...(draft.fallbackRequest.queryCandidates || [])]),
    ],
    helpers.normalizeWhitespace
  );
  const candidatePool =
    requestProvider === "giphy"
      ? dedupeGiphyCandidateFamilies(candidatePoolBase, helpers.normalizeWhitespace)
      : candidatePoolBase;
  const scored = candidatePool.map((candidate, index) => {
    const request = {
      ...draft.request,
      query: candidate,
    };
    const queryKey = helpers.normalizeWhitespace(candidate).toLowerCase();
    const signature = buildRequestSignature(request, helpers.normalizeWhitespace);
    const reuse = getRequestReuseScore(queryKey, signature, globalUsedQueries, localUsedQueries, globalUsed, localUsed);
    const family = requestProvider === "giphy" ? inferGiphyReactionFamily(candidate) : undefined;
    const familyLocalHit = family ? localUsedFamilies.has(family) : false;
    const familyGlobalHit = family ? globalUsedFamilies.has(family) : false;
    const previousFamilyHit = family ? previousGiphyFamily === family : false;
    return {
      candidate,
      queryKey,
      signature,
      index,
      ...reuse,
      family,
      familyLocalHit,
      familyGlobalHit,
      previousFamilyHit,
      score: reuse.score + (familyLocalHit ? 6 : 0) + (familyGlobalHit ? 4 : 0) + (previousFamilyHit ? 7 : 0),
    };
  });
  scored.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    return left.index - right.index;
  });

  const selected = scored[0];
  const orderedCandidateSource = [
    selected?.candidate || draft.request.query || draft.fallbackRequest.query || "",
    ...scored.map((item) => item.candidate),
  ];
  const orderedCandidates =
    requestProvider === "giphy"
      ? dedupeGiphyCandidateFamilies(orderedCandidateSource, helpers.normalizeWhitespace)
      : dedupeValues(orderedCandidateSource, helpers.normalizeWhitespace);
  const request: ImageRequest = {
    ...draft.request,
    query: orderedCandidates[0] || draft.request.query || draft.fallbackRequest.query || "상황 반응",
    queryCandidates: orderedCandidates,
  };
  const signature = buildRequestSignature(request, helpers.normalizeWhitespace);
  const reasonParts = [...draft.debugTags];
  if (selected?.localHit) {
    reasonParts.push("local-used");
  }
  if (selected?.globalHit) {
    reasonParts.push("global-used");
  }
  if (selected?.exactLocalHit) {
    reasonParts.push("exact-local-used");
  }
  if (selected?.exactGlobalHit) {
    reasonParts.push("exact-global-used");
  }
  if (selected?.familyLocalHit) {
    reasonParts.push("family-local-used");
  }
  if (selected?.familyGlobalHit) {
    reasonParts.push("family-global-used");
  }
  if (selected?.previousFamilyHit) {
    reasonParts.push("family-prev-slide");
  }
  if (selected && selected.index > 0) {
    reasonParts.push("fallback-candidate");
  }
  if (reasonParts.length <= 0) {
    reasonParts.push("keep-primary");
  }
  return {
    request,
    signature,
    reason: reasonParts.join(","),
    family: selected?.family,
  };
}

async function buildSlideDraft(
  slide: SlideInput,
  slideIndex: number,
  crawlMode: StudioPrepareRequest["crawlMode"] | undefined,
  helpers: PlannerHelpers
): Promise<SlidePolicyDraft> {
  const lineSegments = buildLineSegments(slide, helpers.normalizeWhitespace);
  const primaryBeat = getPrimaryImageBeat(slide);
  const segmentSlide = createSegmentSlide(slide, lineSegments[0].lines, helpers.normalizeWhitespace);
  const primaryRequest = slide.imageRequest || primaryBeat?.imageRequest;
  const originalProvider = inferProviderFromRequest(primaryRequest, helpers.normalizeWhitespace);
  const initialFallback = helpers.toFallbackImageRequest(segmentSlide, crawlMode);
  const resolvedProvider = originalProvider || inferProviderFromRequest(initialFallback, helpers.normalizeWhitespace);
  const fallback = resolvedProvider
    ? helpers.toFallbackImageRequest(segmentSlide, crawlMode, resolvedProvider)
    : initialFallback;
  return {
    slide,
    slideIndex,
    forcedFourLineSplit: false,
    requests: [
      {
        beatId: `${slideIndex}:0`,
        startLineIndex: 0,
        request: mergeRequestWithFallback(primaryRequest, fallback, segmentSlide, crawlMode, helpers, resolvedProvider),
        fallbackRequest: fallback,
        imageUrl: slide.imageUrl || primaryBeat?.imageUrl,
        debugTags: [
          "segment=full",
          `provider=${resolvedProvider || "auto"}`,
          ...(originalProvider && resolvedProvider && originalProvider !== resolvedProvider
            ? [`provider-shift=${originalProvider}->${resolvedProvider}`]
            : []),
        ],
      },
    ],
  };
}

function rebuildSlide(
  draft: SlidePolicyDraft,
  resolvedRequests: Array<SegmentRequestDraft & { request: ImageRequest }>
): SlideInput {
  const primaryRequest = resolvedRequests[0]?.request || draft.slide.imageRequest;
  const primaryBeat = getPrimaryImageBeat(draft.slide);
  return {
    ...draft.slide,
    imageRequest: primaryRequest,
    imageUrl:
      draft.slide.imageUrl ||
      (primaryBeat && Math.max(0, Math.floor(Number(primaryBeat.startLineIndex) || 0)) === 0
        ? primaryBeat.imageUrl || primaryBeat.resolvedImageUrl
        : undefined),
    imageBeats: draft.slide.imageBeats,
  };
}

export async function applyImageSelectionPlanningPolicy(
  input: SelectionPolicyInput
): Promise<{ slides: SlideInput[]; warnings: string[] }> {
  const warnings: string[] = [];
  const drafts = await Promise.all(input.slides.map((slide, slideIndex) => buildSlideDraft(slide, slideIndex, input.crawlMode, input.helpers)));
  const globalUsed = new Set<string>();
  const globalUsedQueries = new Set<string>();
  const globalUsedFamilies = new Set<string>();
  let previousGiphyFamily: string | undefined;
  const slides = drafts.map((draft) => {
    const localUsed = new Set<string>();
    const localUsedQueries = new Set<string>();
    const localUsedFamilies = new Set<string>();
    let selectedSlideFamily: string | undefined;
    const resolvedRequests = draft.requests.map((requestDraft, beatIndex) => {
      const chosen = chooseDistinctRequest(
        requestDraft,
        globalUsedQueries,
        localUsedQueries,
        globalUsed,
        localUsed,
        globalUsedFamilies,
        localUsedFamilies,
        previousGiphyFamily,
        input.helpers
      );
      localUsedQueries.add(input.helpers.normalizeWhitespace(chosen.request.query || "").toLowerCase());
      globalUsedQueries.add(input.helpers.normalizeWhitespace(chosen.request.query || "").toLowerCase());
      localUsed.add(chosen.signature);
      globalUsed.add(chosen.signature);
      if (chosen.family) {
        localUsedFamilies.add(chosen.family);
        globalUsedFamilies.add(chosen.family);
        selectedSlideFamily = chosen.family;
      }
      if (input.debug) {
        warnings.push(
          `[debug] selection-policy slide[${draft.slideIndex}] beat[${beatIndex}] start=${requestDraft.startLineIndex} query="${chosen.request.query}" reason=${chosen.reason}`
        );
      }
      return {
        ...requestDraft,
        request: chosen.request,
      };
    });
    if (draft.forcedFourLineSplit && input.debug) {
      warnings.push(
        `[debug] selection-policy slide[${draft.slideIndex}] enforced=4-line-split startLines=${resolvedRequests.map((item) => item.startLineIndex).join("|")}`
      );
    }
    previousGiphyFamily = selectedSlideFamily;
    return rebuildSlide(draft, resolvedRequests);
  });
  return { slides, warnings };
}
