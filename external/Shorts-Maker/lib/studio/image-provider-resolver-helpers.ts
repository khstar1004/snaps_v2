import { analyzeImageRequestSearchSignal } from "@/lib/studio/images/intent";
import {
  normalizeMemeSearchPhrase,
  sanitizeSearchQueryCandidate,
  stripMemeSearchSuffix,
} from "@/lib/studio/images/intent";
import {
  DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES,
  dedupeGiphyQueriesByFamily,
  isGiphySearchableQuery,
  normalizeGiphySearchQuery,
  sanitizeTrustedGiphyPlannerQuery,
} from "@/lib/studio/giphy-query-utils";
import { toEnglishHint } from "@/lib/studio/query-translation";
import type { ImageProviderId, ImageRequest } from "@/types/studio-json";

const ALLOWED_PROVIDER_ORDER: ImageProviderId[] = [
  "library",
  "naver",
  "pexels",
  "pixabay",
  "openverse",
  "wikimedia",
  "giphy",
];
const DEFAULT_PROVIDER_ORDER: ImageProviderId[] = ["giphy", "naver", "pexels", "pixabay", "openverse", "wikimedia"];
const GENERIC_QUERY_TOKENS = new Set(["사진", "이미지", "장면", "모습", "현장", "뉴스", "관련"]);
const PROVIDER_TAG_STOPWORDS = new Set(["gif", "gifs", "giphy", "reaction", "official", "original", "the", "and"]);
const LOW_QUALITY_PATH_HINTS = [
  "thumb",
  "thumbnail",
  "logo",
  "icon",
  "banner",
  "ad",
  "watermark",
  "capture",
  "sticker",
  "transparent",
  "vector",
  "template",
  "clipart",
  "emoji",
  "avatar",
];
const LOW_QUALITY_TEXT_HINTS = [
  "워터마크",
  "로고",
  "썸네일",
  "광고",
  "배너",
  "일러스트",
  "합성",
  "스티커",
  "투명",
  "이모지",
  "템플릿",
  "벡터",
  "클립아트",
  "문구",
];
const MEME_LOW_QUALITY_HINTS = ["sticker", "transparent", "emoji", "caption", "text", "template", "generator", "pack", "subtitle"];
const STOCK_ABSTRACT_HINTS = ["vector", "illustration", "clipart", "isolated", "background", "template", "set"];
const REACTION_RESULT_HINTS = [
  "reaction",
  "face",
  "expression",
  "laugh",
  "smile",
  "shock",
  "surprise",
  "angry",
  "cry",
  "awkward",
  "facepalm",
  "side eye",
  "confused",
  "scared",
];
const PHOTO_RESULT_HINTS = [
  "photo",
  "portrait",
  "person",
  "people",
  "office",
  "hallway",
  "document",
  "receipt",
  "phone",
  "screen",
  "shadow",
  "silhouette",
  "door",
  "light",
  "conference",
  "briefing",
  "paperwork",
];
const PROFESSIONAL_SERVICE_HINTS = [
  "세무",
  "회계",
  "세무사",
  "세무사무소",
  "환급",
  "경정청구",
  "홈택스",
  "가산세",
  "법률",
  "변호사",
  "법무",
  "법무법인",
  "상담",
  "서류",
  "증빙",
];
const PROFESSIONAL_SERVICE_RISK_TOKENS = [
  "세무법인",
  "회계법인",
  "세무사무소",
  "법무법인",
  "로펌",
  "변호사사무실",
  "무료상담",
  "상담문의",
  "전화상담",
  "카카오톡상담",
  "다운로드",
  "앱추천",
  "업체추천",
  "프로모션",
  "event",
  "contact",
  "consult",
  "law firm",
  "tax firm",
  "accounting firm",
];
const GIPHY_MEME_TAG_HINTS = [
  "reaction",
  "meme",
  "funny",
  "lol",
  "lmao",
  "facepalm",
  "awkward",
  "cringe",
  "shocked",
  "surprised",
  "angry",
  "laughing",
  "confused",
  "wtf",
  "omg",
  "fail",
  "scared",
  "horror",
  "creepy",
  "terrified",
  "startled",
];
const GIPHY_CONTEXT_STOPWORDS = [
  "자영업자",
  "소상공인",
  "사장",
  "사장님",
  "직장인",
  "회사원",
  "세무",
  "세금",
  "환급",
  "경정청구",
  "홈택스",
  "신고",
  "서류",
  "상담",
  "회계",
  "법률",
  "법무",
  "변호사",
  "업무",
  "일",
  "표정",
  "사진",
  "이미지",
  "짤",
  "움짤",
  "gif",
  "meme",
  "reaction",
];
const GIPHY_REACTION_QUERY_MAP: Array<{ hints: string[]; keywords: string[]; queries: string[] }> = [
  { hints: ["기쁨", "기쁜", "행복", "행복함", "즐거움", "즐거운", "신남", "신난"], keywords: ["happy", "joy", "excited", "celebration"], queries: ["happy reaction", "happy meme", "excited reaction", "celebration reaction"] },
  { hints: ["여유", "느긋", "편안", "평온", "안심", "안도"], keywords: ["relieved", "chill", "calm", "smug"], queries: ["relieved reaction", "chill reaction", "calm smile", "smug smile"] },
  { hints: ["자신", "당당", "뿌듯", "우쭐", "의기양양"], keywords: ["confident", "smug", "boss", "winning"], queries: ["confident reaction", "smug reaction", "boss reaction", "winning reaction"] },
  { hints: ["당황", "민망", "어색", "뻘쭘"], keywords: ["awkward", "cringe", "flustered", "side eye"], queries: ["awkward reaction", "nervous laugh", "cringe reaction", "side eye reaction"] },
  { hints: ["놀람", "충격", "경악", "헉"], keywords: ["surprise", "shocked", "surprised", "omg"], queries: ["shocked reaction", "surprised reaction", "omg reaction"] },
  { hints: ["분노", "화남", "열받", "빡침"], keywords: ["angry", "mad", "rage", "furious"], queries: ["angry reaction", "mad reaction", "rage reaction"] },
  { hints: ["답답", "한숨", "어이없", "황당"], keywords: ["facepalm", "wtf", "bruh", "speechless"], queries: ["facepalm reaction", "tired reaction", "done with this reaction"] },
  { hints: ["웃김", "웃긴", "폭소", "웃음"], keywords: ["funny", "laughing", "lol", "lmao"], queries: ["funny reaction", "laughing reaction", "lol reaction"] },
  { hints: ["슬픔", "우울", "눈물", "울컥"], keywords: ["crying", "sad", "sobbing"], queries: ["crying reaction", "sad reaction"] },
  { hints: ["고민", "걱정", "불안", "초조"], keywords: ["thinking", "anxious", "worried"], queries: ["thinking reaction", "anxious reaction", "worried reaction"] },
  { hints: ["공포", "무섭", "오싹", "소름", "섬뜩", "철렁", "새벽"], keywords: ["scared", "horror", "creepy", "startled", "terrified"], queries: ["scared reaction", "horror reaction", "creepy reaction", "startled reaction", "terrified reaction"] },
  { hints: ["실망", "허탈", "망함", "망했다"], keywords: ["disappointed", "fail", "bruh", "defeated"], queries: ["disappointed reaction", "fail reaction", "bruh reaction"] },
  { hints: ["부럽", "질투"], keywords: ["jealous", "envy"], queries: ["jealous reaction", "envy reaction"] },
  { hints: ["돈", "매출", "대박", "수익"], keywords: ["money", "rich", "success"], queries: ["money reaction", "rich reaction", "success reaction"] },
  { hints: ["정색", "굳음", "얼음", "무표정"], keywords: ["deadpan", "serious", "blank stare"], queries: ["deadpan reaction", "serious face reaction", "blank stare reaction"] },
  { hints: ["멘붕", "현타", "멍함", "멍", "머리 하얘"], keywords: ["mind blown", "stunned", "buffering"], queries: ["mind blown reaction", "stunned reaction", "buffering reaction"] },
  { hints: ["식은땀", "진땀", "쫄림", "긴장"], keywords: ["nervous", "sweating", "panicked"], queries: ["nervous reaction", "sweating reaction", "panicked reaction"] },
  { hints: ["억울", "분통"], keywords: ["frustrated", "upset", "sulking"], queries: ["frustrated reaction", "upset reaction", "sulking reaction"] },
  { hints: ["수상", "의심", "찝찝", "쎄한"], keywords: ["suspicious", "side eye", "skeptical"], queries: ["suspicious reaction", "side eye reaction", "skeptical reaction"] },
];
const STOCK_REACTION_QUERY_MAP: Array<{ hints: string[]; queries: string[] }> = [
  { hints: ["기쁨", "기쁜", "행복", "행복함", "즐거움", "즐거운", "신남", "신난"], queries: ["happy person", "joyful smile", "excited celebration"] },
  { hints: ["여유", "느긋", "편안", "평온", "안심", "안도"], queries: ["relieved person", "calm smile", "confident smile"] },
  { hints: ["자신", "당당", "뿌듯", "우쭐", "의기양양"], queries: ["confident person", "smug smile", "winning pose"] },
  { hints: ["당황", "민망", "어색", "뻘쭘"], queries: ["awkward person", "nervous smile", "embarrassed face"] },
  { hints: ["놀람", "충격", "경악", "헉"], queries: ["shocked face", "surprised person", "startled reaction face"] },
  { hints: ["분노", "화남", "열받", "빡침"], queries: ["angry face", "furious person", "mad expression"] },
  { hints: ["답답", "한숨", "어이없", "황당"], queries: ["facepalm person", "tired expression", "speechless person"] },
  { hints: ["웃김", "웃긴", "폭소", "웃음"], queries: ["laughing person", "laughing face", "funny reaction face"] },
  { hints: ["슬픔", "우울", "눈물", "울컥"], queries: ["crying face", "sad person", "tearful expression"] },
  { hints: ["고민", "걱정", "불안", "초조"], queries: ["thinking person", "worried face", "anxious expression"] },
  { hints: ["공포", "무섭", "오싹", "소름", "섬뜩", "철렁", "새벽"], queries: ["scared face", "fearful expression", "creepy hallway"] },
];

export function normalizeProviders(providers?: ImageProviderId[]): ImageProviderId[] {
  if (!providers || providers.length <= 0) return DEFAULT_PROVIDER_ORDER;
  const normalized: ImageProviderId[] = [];
  for (const provider of providers) {
    if (!ALLOWED_PROVIDER_ORDER.includes(provider)) continue;
    if (!normalized.includes(provider)) normalized.push(provider);
  }
  return normalized.length > 0 ? normalized : DEFAULT_PROVIDER_ORDER;
}

export function parsePositiveNumber(value: string | number | undefined): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function parseHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function toQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !GENERIC_QUERY_TOKENS.has(token));
}

export function collectHintMatches(text: string, hints: string[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const hint of hints) {
    if (lower.includes(hint.toLowerCase()) && !hits.includes(hint)) hits.push(hint);
  }
  return hits;
}

export function buildRequestMatchTokens(request: ImageRequest): { primary: string[]; secondary: string[] } {
  const primarySeeds = [request.query].map((value) => String(value || "").trim()).filter(Boolean);
  const secondarySeeds = [
    ...(request.queryCandidates || []),
    request.scene || "",
    ...(request.people || []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const primary = dedupeQueries([
    ...primarySeeds.flatMap((seed) => toQueryTokens(seed)),
    ...primarySeeds.flatMap((seed) => toQueryTokens(toEnglishHint(seed))),
  ]);
  const secondary = dedupeQueries([
    ...secondarySeeds.flatMap((seed) => toQueryTokens(seed)),
    ...secondarySeeds.flatMap((seed) => toQueryTokens(toEnglishHint(seed))),
  ]).filter((token) => !primary.includes(token));
  return { primary, secondary };
}

export function orientationMatches(
  orientation: ImageRequest["orientation"],
  width?: number,
  height?: number
): boolean {
  if (!orientation || orientation === "any") return true;
  if (!width || !height) return true;
  if (orientation === "portrait") return height >= width;
  return width >= height;
}

export function countHits(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (lower.includes(token)) hits += 1;
  }
  return hits;
}

export function containsMustAvoid(text: string, mustAvoid: string[]): boolean {
  const lower = text.toLowerCase();
  return mustAvoid.some((token) => lower.includes(token.toLowerCase()));
}

export function isProfessionalServiceRequest(request: ImageRequest): boolean {
  const corpus = [request.query, request.scene || "", ...(request.queryCandidates || [])].join(" ").toLowerCase();
  return PROFESSIONAL_SERVICE_HINTS.some((token) => corpus.includes(token.toLowerCase()));
}

export function getMinProviderScore(provider: ImageProviderId, request: ImageRequest, intent: "news" | "meme"): number {
  const signal = analyzeImageRequestSearchSignal(request);
  if (provider === "library") {
    return intent === "meme" ? 6 : 8;
  }
  if (provider === "giphy") {
    if (intent === "meme" && signal.hasConcreteVisualCue && !signal.hasMemeCue) return 10;
    return 0;
  }
  if (isProfessionalServiceRequest(request)) {
    if (provider === "pexels" || provider === "pixabay") return 12;
    return Math.min(18, 14);
  }
  if (provider === "pexels" || provider === "pixabay") return 12;
  return 18;
}

export function buildNeutralBrollFallbacks(request: ImageRequest): string[] {
  if (!isProfessionalServiceRequest(request)) return [];
  return [
    "office desk documents",
    "consultation meeting office",
    "paperwork laptop desk",
    "tax filing documents office",
    "legal consultation paperwork",
  ];
}

export function dedupeQueries(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

export function trimQueryLength(value: string, max = 50): string {
  return value.trim().slice(0, max).trim();
}

export function containsLatin(value: string): boolean {
  return /[a-z]/i.test(value);
}

export function containsHangul(value: string): boolean {
  return /[가-힣]/u.test(value);
}

export function toEnglishOnlyQueries(values: string[], fallback: string[]): string[] {
  const filtered = dedupeQueries(
    values
      .map((value) => trimQueryLength(value))
      .filter((value) => containsLatin(value) && !containsHangul(value))
  );
  if (filtered.length > 0) return filtered;
  return fallback;
}

export function normalizeGiphyTagValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveProviderTags(values: string[]): string[] {
  return dedupeQueries(
    values
      .flatMap((value) => normalizeGiphyTagValue(value).split(/\s+/))
      .map((value) => value.trim())
      .filter((value) => value.length >= 2)
      .filter((value) => !PROVIDER_TAG_STOPWORDS.has(value))
  ).slice(0, 8);
}

export function toGiphyTagScore(tag: string): number {
  const normalized = normalizeGiphyTagValue(tag);
  if (!normalized) return 0;
  let score = 0;
  for (const hint of GIPHY_MEME_TAG_HINTS) {
    if (normalized === hint) score += 8;
    else if (normalized.includes(hint)) score += 4;
  }
  if (normalized.includes("reaction")) score += 3;
  if (normalized.includes("meme")) score += 3;
  if (normalized.split(/\s+/).length <= 3) score += 1;
  return score;
}

export function buildGiphyReactionQueriesFromRequest(request: ImageRequest): string[] {
  const sourceValues = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => normalizeMemeSearchPhrase(String(value || "").trim()))
    .filter(Boolean);
  const corpus = sourceValues.join(" ");
  const normalizedCorpus = corpus ? corpus.toLowerCase() : "";
  if (!normalizedCorpus) {
    return dedupeGiphyQueriesByFamily([...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES], { limit: 6, sanitize: true });
  }

  const queries = sourceValues
    .map((value) => normalizeGiphySearchQuery(value))
    .filter(isGiphySearchableQuery)
    .slice(0, 4);
  for (const rule of GIPHY_REACTION_QUERY_MAP) {
    if (rule.hints.some((hint) => normalizedCorpus.includes(hint)) || rule.keywords.some((keyword) => normalizedCorpus.includes(keyword))) {
      for (const query of rule.queries) {
        if (!queries.includes(query)) queries.push(query);
      }
    }
  }

  const contextTokens = normalizedCorpus
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !GIPHY_CONTEXT_STOPWORDS.includes(token))
    .slice(0, 3);
  if (queries.length > 0 && contextTokens.length > 0) {
    for (const token of contextTokens) {
      const english = toEnglishHint(token);
      if (!english) continue;
      queries.push(`${english} reaction`);
    }
  }

  if (queries.length <= 0) {
    return dedupeGiphyQueriesByFamily([...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES], { limit: 6, sanitize: true });
  }

  const englishOnlyQueries = toEnglishOnlyQueries(dedupeQueries(queries), [...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES]);
  const curated = dedupeGiphyQueriesByFamily(
    englishOnlyQueries
      .map((value) => sanitizeTrustedGiphyPlannerQuery(value))
      .filter(Boolean),
    { limit: 8, sanitize: false }
  );
  if (curated.length > 0) return curated;
  return dedupeGiphyQueriesByFamily([...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES], { limit: 6, sanitize: true });
}

export function buildGiphyExactPhraseQueries(request: ImageRequest): string[] {
  const signal = analyzeImageRequestSearchSignal(request);
  const rawPhrases = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => stripSuffix(value.trim()))
    .filter(Boolean);
  const sanitized = rawPhrases
    .map((phrase) =>
      sanitizeSearchQueryCandidate(phrase, {
        mode: "fun",
        allowMemeTerms: false,
        maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
      })
    )
    .filter(Boolean);
  const englishHints = dedupeQueries(
    [...rawPhrases, ...sanitized]
      .map((value) => trimQueryLength(toEnglishHint(value)))
      .filter((value) => containsLatin(value))
  );
  if (englishHints.length > 0) {
    return englishHints.filter(isGiphySearchableQuery).slice(0, 6);
  }
  const safeAsciiSanitized = sanitized
    .map((value) => trimQueryLength(value))
    .filter((value) => containsLatin(value) && !containsHangul(value) && isGiphySearchableQuery(value));
  if (safeAsciiSanitized.length > 0) {
    return dedupeQueries(safeAsciiSanitized).slice(0, 6);
  }
  return [];
}

export function buildStockReactionQueriesFromRequest(request: ImageRequest): string[] {
  const values = [request.query, ...(request.queryCandidates || []), request.scene || ""].filter(Boolean);
  const corpus = values.join(" ").toLowerCase();
  if (!corpus) return [];
  const queries: string[] = [];
  for (const rule of STOCK_REACTION_QUERY_MAP) {
    if (!rule.hints.some((hint) => corpus.includes(hint))) continue;
    for (const query of rule.queries) {
      if (!queries.includes(query)) queries.push(query);
    }
  }
  return dedupeQueries(queries).slice(0, 6);
}

export function dedupeProviderCandidates<T extends { id: string; url: string }>(candidates: T[]): T[] {
  const deduped: T[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const candidate of candidates) {
    const id = candidate.id.trim();
    const url = candidate.url.trim();
    if (!id || !url) continue;
    if (seenIds.has(id) || seenUrls.has(url)) continue;
    seenIds.add(id);
    seenUrls.add(url);
    deduped.push(candidate);
  }
  return deduped;
}

export function overlapScore(left: string[], right: string[]): number {
  if (left.length <= 0 || right.length <= 0) return 0;
  const rightSet = new Set(right);
  let hits = 0;
  for (const token of left) {
    if (rightSet.has(token)) hits += 1;
  }
  return hits / Math.max(1, Math.min(left.length, right.length));
}

export function isTooSimilarToExistingLibraryCandidate(existingTokenSets: string[][], candidateTokens: string[]): boolean {
  if (candidateTokens.length <= 0 || existingTokenSets.length <= 0) return false;
  for (const tokenSet of existingTokenSets) {
    const score = overlapScore(tokenSet, candidateTokens);
    if (score >= 0.75) return true;
  }
  return false;
}

function stripSuffix(value: string): string {
  return stripMemeSearchSuffix(value);
}

export { isBlockedPromotionalNaverCandidate } from "@/lib/studio/image-resolver";
export { isGiphySearchableQuery } from "@/lib/studio/giphy-query-utils";
