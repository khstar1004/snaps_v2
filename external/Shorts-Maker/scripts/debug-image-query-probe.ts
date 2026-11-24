import {
  analyzeImageRequestSearchSignal,
  buildConcreteVisualSearchCandidates,
  buildShortReactionSearchCandidates,
  normalizeMemeSearchPhrase,
  sanitizeSearchQueryCandidate,
  stripMemeSearchSuffix,
} from "@/lib/studio/images/intent";
import type { ImageRequest } from "@/types/studio-json";

type ProviderIntent = "news" | "meme";

const QUERY_DROP_TOKENS = new Set([
  "한국",
  "대한민국",
  "국내",
  "해외",
  "장면",
  "모습",
  "화난",
  "강한",
  "표정",
  "미친",
  "듯이",
  "소리",
  "지르는",
  "하는",
  "있는",
  "에서",
  "으로",
  "지지율",
  "조사",
  "결과",
  "발표",
  "여론조사",
  "그래프",
  "내부",
  "갈등",
  "논란",
  "엑스",
  "게시글",
  "페이스북",
  "소셜미디어",
  "소셜",
  "포스트",
  "캡처",
  "관련",
  "공유",
]);

const CTA_HINT_TOKENS = ["구독", "좋아요", "알림", "팔로우", "follow", "subscribe", "comment", "댓글", "메일", "이메일"];
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
const KO_EN_QUERY_MAP: Array<[RegExp, string]> = [
  [/세무|세금|가산세|경정청구|환급|홈택스/gu, "tax filing documents"],
  [/회계|장부|정산/gu, "accounting office work"],
  [/법률|법무|변호사|소송|계약/gu, "legal consultation documents"],
  [/상담/gu, "consultation desk meeting"],
  [/서류|증빙|자료/gu, "documents paperwork desk"],
  [/컴퓨터|노트북|입력/gu, "computer office work"],
  [/영수증|계산서|결제/gu, "receipt close up photo"],
  [/문틈|문|복도|불빛/gu, "hallway door light"],
  [/그림자|실루엣|형체/gu, "shadow silhouette hallway"],
  [/스마트폰|휴대폰|문자|카톡|채팅/gu, "phone text message screen"],
  [/통장|계좌|은행/gu, "bank account book"],
  [/국회|브리핑|기자회견/gu, "press briefing conference"],
  [/당황|민망|뻘쭘|어색|식은땀/gu, "awkward embarrassed reaction"],
  [/황당|어이없|말문막|할말잃/gu, "speechless wtf reaction"],
  [/정색|굳음|얼음|무표정/gu, "deadpan serious face"],
  [/멘붕|현타|멍함|멍|머리 하얘/gu, "mind blown stunned reaction"],
  [/빡침|분노|짜증|열받/gu, "angry furious annoyed reaction"],
  [/안도|다행|살았다|여유/gu, "relieved calm reaction"],
  [/억울|답답|분통/gu, "frustrated upset reaction"],
  [/수상|의심|찝찝|쎄한|촉/gu, "suspicious side eye reaction"],
  [/공포|무섭|오싹|소름|섬뜩/gu, "horror scary creepy"],
  [/새벽|한밤중|심야/gu, "midnight dark night"],
  [/철렁|심장 철렁|심쿵|깜놀/gu, "startled shocked heart drop"],
];
const GIPHY_REACTION_QUERY_MAP: Array<{ hints: string[]; keywords: string[]; queries: string[] }> = [
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

function mergeUniqueValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function dedupeQueries(values: string[]): string[] {
  return mergeUniqueValues(values);
}

function trimQueryLength(value: string, max = 50): string {
  return value.trim().slice(0, max).trim();
}

function containsHangul(value: string): boolean {
  return /[가-힣]/u.test(value);
}

function includesCtaToken(value: string): boolean {
  const lower = value.toLowerCase();
  return CTA_HINT_TOKENS.some((token) => lower.includes(token));
}

function inferSceneSuffix(tokens: string[]): string {
  const joined = tokens.join(" ");
  if (
    joined.includes("유튜브") ||
    joined.includes("쇼츠") ||
    joined.includes("구독") ||
    joined.includes("댓글") ||
    joined.includes("알림") ||
    joined.includes("채널")
  ) {
    return "유튜브 구독 버튼 화면 사진";
  }
  if (joined.includes("의원총회") || joined.includes("본회의") || joined.includes("국회")) {
    return "국회 회의장 사진";
  }
  if (joined.includes("대통령") || joined.includes("대통령실") || joined.includes("청와대")) {
    return "대통령실 브리핑 사진";
  }
  if (joined.includes("국민의힘") || joined.includes("대표")) {
    return "국회 기자회견 사진";
  }
  return "현장 사진";
}

function simplifyImageQuery(query: string): string {
  const normalized = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !QUERY_DROP_TOKENS.has(token))
    .slice(0, 4);
  return tokens.join(" ").trim() || normalized;
}

function toNounFocusedQuery(query: string): string {
  const normalized = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !QUERY_DROP_TOKENS.has(token))
    .slice(0, 3);
  return tokens.join(" ").trim() || normalized;
}

function buildQueryVariants(rawQuery: string): string[] {
  const compact = rawQuery.trim();
  if (!compact) return [];
  const sanitized =
    sanitizeSearchQueryCandidate(compact, {
      mode: "stock",
      allowMemeTerms: false,
      maxTokens: 4,
    }) || compact;
  const simplified = simplifyImageQuery(sanitized);
  const simplifiedTokens = simplified
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "사진");
  const focusedCore = simplifiedTokens.slice(0, 3);
  const focused = [...focusedCore, inferSceneSuffix(simplifiedTokens)].join(" ").trim();
  const nounFocused = toNounFocusedQuery(sanitized);
  const keepCompact = compact.split(/\s+/).filter(Boolean).length <= 4 && compact.length <= 28;
  return mergeUniqueValues([sanitized, simplified, nounFocused, focused, keepCompact ? compact : ""]);
}

function buildShortMemeQueries(rawQuery: string): string[] {
  return buildShortReactionSearchCandidates([rawQuery]);
}

function buildMemeVariants(rawQuery: string): string[] {
  const compact = normalizeMemeSearchPhrase(rawQuery.trim());
  if (!compact) return [];
  const signal = analyzeImageRequestSearchSignal(compact);
  const shortQueries = buildShortMemeQueries(compact);
  const visualQueries = buildConcreteVisualSearchCandidates([compact]);
  const normalized = compact
    .replaceAll("사진", " ")
    .replaceAll("이미지", " ")
    .replaceAll("현장", " ")
    .replace(/\s+/g, " ")
    .trim();
  const sanitized =
    sanitizeSearchQueryCandidate(compact, {
      mode: "fun",
      allowMemeTerms: !signal.hasConcreteVisualCue,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) || normalized || compact;
  const base = stripMemeSearchSuffix(sanitized) || normalized || compact;
  const exactKoreanPhrase = stripMemeSearchSuffix(compact);
  const keepCompact = compact.split(/\s+/).filter(Boolean).length <= 4 && compact.length <= 28;
  const leadingQueries = signal.hasConcreteVisualCue ? visualQueries : shortQueries;
  const secondaryQueries = signal.hasConcreteVisualCue ? shortQueries : visualQueries;
  return mergeUniqueValues([
    ...leadingQueries,
    /[가-힣]/u.test(exactKoreanPhrase) ? exactKoreanPhrase : "",
    /[가-힣]/u.test(exactKoreanPhrase) && !signal.hasConcreteVisualCue ? `${exactKoreanPhrase} 짤` : "",
    ...secondaryQueries,
    sanitized,
    signal.hasConcreteVisualCue ? base : `${base} 짤`,
    signal.hasConcreteVisualCue ? `${base} 사진` : `${base} 밈`,
    signal.hasConcreteVisualCue ? "" : `${base} 움짤`,
    signal.hasConcreteVisualCue ? "" : `${base} gif`,
    keepCompact ? compact : "",
  ]);
}

function buildSeedQueries(request: ImageRequest, options?: { memeIntent?: boolean }): string[] {
  const memeIntent = Boolean(options?.memeIntent);
  const signal = analyzeImageRequestSearchSignal(request);
  const mode = memeIntent ? "fun" : "stock";
  const seeds = [request.query, ...(request.queryCandidates ?? [])]
    .map((x) => normalizeMemeSearchPhrase(x.trim()))
    .filter(Boolean);
  const reactionSeedShortcuts = memeIntent ? buildShortReactionSearchCandidates(seeds) : [];
  const visualSeedQueries = memeIntent ? buildConcreteVisualSearchCandidates([request.scene || "", ...seeds]) : [];
  const uniqueSeeds = mergeUniqueValues([
    ...(memeIntent ? (signal.hasConcreteVisualCue ? visualSeedQueries : reactionSeedShortcuts) : []),
    ...seeds,
    ...seeds.map((seed) =>
      sanitizeSearchQueryCandidate(seed, {
        mode,
        allowMemeTerms: memeIntent && !signal.hasConcreteVisualCue,
        maxTokens: memeIntent && signal.hasConcreteVisualCue ? 4 : 3,
      })
    ),
    ...(memeIntent ? (signal.hasConcreteVisualCue ? reactionSeedShortcuts : visualSeedQueries) : []),
  ]);

  const suppressSceneSeed =
    !signal.hasConcreteVisualCue &&
    (request.plannerSource === "codex" || (memeIntent && signal.hasReactionCue));
  const shouldIncludeSceneSeed = !suppressSceneSeed || signal.hasConcreteVisualCue || !signal.hasReactionCue;
  const people = request.people ?? [];
  const scene = normalizeMemeSearchPhrase((request.scene || "").trim());
  const sanitizedScene = scene
    ? sanitizeSearchQueryCandidate(scene, {
        mode: memeIntent ? "fun" : "stock",
        allowMemeTerms: false,
        maxTokens: 4,
      })
    : "";
  if (shouldIncludeSceneSeed && people.length > 0 && scene) {
    uniqueSeeds.push(
      sanitizeSearchQueryCandidate(`${people[0]} ${scene}`, {
        mode: memeIntent ? "fun" : "stock",
        allowMemeTerms: false,
        maxTokens: 4,
      }) || `${people[0]} ${scene} 사진`
    );
  }
  if (shouldIncludeSceneSeed && scene) {
    uniqueSeeds.push(sanitizedScene || `${scene} 사진`);
  }

  return mergeUniqueValues(uniqueSeeds);
}

function buildQueryVariantsFromRequest(request: ImageRequest, options?: { memeIntent?: boolean }): string[] {
  const seeds = buildSeedQueries(request, options);
  const variants: string[] = [];
  const memeIntent = Boolean(options?.memeIntent);
  for (const seed of seeds) {
    const perSeedVariants = memeIntent ? buildMemeVariants(seed) : buildQueryVariants(seed);
    for (const variant of perSeedVariants) {
      if (!variants.includes(variant)) variants.push(variant);
    }
  }
  return variants;
}

function toEnglishHint(value: string): string {
  let out = value.trim();
  for (const [pattern, replacement] of KO_EN_QUERY_MAP) {
    out = out.replace(pattern, ` ${replacement} `);
  }
  return out
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isProfessionalServiceRequest(request: ImageRequest): boolean {
  const corpus = [request.query, request.scene || "", ...(request.queryCandidates || [])].join(" ").toLowerCase();
  return PROFESSIONAL_SERVICE_HINTS.some((token) => corpus.includes(token.toLowerCase()));
}

function buildNeutralBrollFallbacks(request: ImageRequest): string[] {
  if (!isProfessionalServiceRequest(request)) return [];
  return [
    "office desk documents",
    "consultation meeting office",
    "paperwork laptop desk",
    "tax filing documents office",
    "legal consultation paperwork",
  ];
}

function buildStockReactionQueriesFromRequest(request: ImageRequest): string[] {
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

function buildGiphyReactionQueriesFromRequest(request: ImageRequest): string[] {
  const corpus = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => normalizeMemeSearchPhrase(String(value || "").trim()).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!corpus) {
    return ["funny reaction", "meme reaction"];
  }

  const queries: string[] = [];
  for (const rule of GIPHY_REACTION_QUERY_MAP) {
    if (rule.hints.some((hint) => corpus.includes(hint))) {
      for (const keyword of rule.keywords) {
        if (!queries.includes(keyword)) queries.push(keyword);
      }
      for (const query of rule.queries) {
        if (!queries.includes(query)) queries.push(query);
      }
    }
  }

  const contextTokens = corpus
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
    return ["funny reaction", "meme reaction", "relatable reaction"];
  }

  return dedupeQueries(queries).slice(0, 8);
}

function buildGiphyExactPhraseQueries(request: ImageRequest): string[] {
  const signal = analyzeImageRequestSearchSignal(request);
  const rawPhrases = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => stripMemeSearchSuffix(String(value || "").trim()))
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
  const englishHints = dedupeQueries([...rawPhrases, ...sanitized].map((value) => toEnglishHint(value)).filter(Boolean));
  const includeRawPhraseFallbacks = !signal.looksLikeSentence && !signal.hasReactionCue;
  const includeEnglishHintFallbacks = !signal.looksLikeSentence;
  return dedupeQueries([
    ...sanitized.slice(0, 2),
    ...(includeRawPhraseFallbacks ? rawPhrases.slice(0, 2) : []),
    ...(includeEnglishHintFallbacks ? englishHints.slice(0, 2) : []),
  ]).slice(0, 6);
}

function buildGiphyQuery(request: ImageRequest, intent: ProviderIntent): string {
  if (intent === "meme") {
    const reactionQueries = buildGiphyReactionQueriesFromRequest(request);
    const bareKeyword = reactionQueries.find((query) => !query.includes("reaction") && !query.includes(" "));
    if (bareKeyword) return bareKeyword;
  }
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(value.trim()))
    .filter(Boolean);
  const base = toEnglishHint(seeds[0] || request.scene?.trim() || "reaction");
  if (intent === "meme") {
    return `${base} meme reaction`.trim();
  }
  return `${base} reaction`.trim();
}

function buildPexelsQuery(request: ImageRequest, intent: ProviderIntent): string {
  const signal = analyzeImageRequestSearchSignal(request);
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => value.trim())
    .filter(Boolean);
  const sanitizedBase =
    sanitizeSearchQueryCandidate(seeds[0] || request.scene?.trim() || "", {
      mode: intent === "meme" ? "fun" : "stock",
      allowMemeTerms: false,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) ||
    seeds[0] ||
    request.scene?.trim() ||
    "office work";
  const stockReaction = buildStockReactionQueriesFromRequest(request);
  const visualFallback = buildConcreteVisualSearchCandidates([request.scene || "", ...seeds])[0];
  return toEnglishHint(stockReaction[0] || visualFallback || sanitizedBase) || "office work";
}

function buildPixabayQuery(request: ImageRequest, intent: ProviderIntent): string {
  const signal = analyzeImageRequestSearchSignal(request);
  const seeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => value.trim())
    .filter(Boolean);
  const sanitizedBase =
    sanitizeSearchQueryCandidate(seeds[0] || request.scene?.trim() || "", {
      mode: intent === "meme" ? "fun" : "stock",
      allowMemeTerms: false,
      maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
    }) ||
    seeds[0] ||
    request.scene?.trim() ||
    "office work";
  const stockReaction = buildStockReactionQueriesFromRequest(request);
  const visualFallback = buildConcreteVisualSearchCandidates([request.scene || "", ...seeds])[0];
  return toEnglishHint(stockReaction[0] || visualFallback || sanitizedBase) || "office work";
}

function buildProviderQueries(provider: "giphy" | "pexels" | "pixabay" | "naver", request: ImageRequest, intent: ProviderIntent): string[] {
  const signal = analyzeImageRequestSearchSignal(request);
  const querySeeds = [request.query, ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(value.trim()))
    .filter(Boolean);
  const sceneSeed = normalizeMemeSearchPhrase((request.scene || "").trim());
  const seeds =
    request.plannerSource === "codex" && intent === "meme" && !signal.hasConcreteVisualCue
      ? querySeeds
      : [...querySeeds, sceneSeed].filter(Boolean);
  const sanitizedSeeds = dedupeQueries(
    seeds
      .map((seed) =>
        sanitizeSearchQueryCandidate(seed, {
          mode: intent === "meme" ? "fun" : "stock",
          allowMemeTerms: provider === "giphy" && intent === "meme" && !signal.hasConcreteVisualCue,
          maxTokens: intent === "meme" && signal.hasConcreteVisualCue ? 4 : 3,
        })
      )
      .filter(Boolean)
  );
  const reactionShortcuts = intent === "meme" ? buildShortReactionSearchCandidates(seeds) : [];
  const visualFallbacks = intent === "meme" ? buildConcreteVisualSearchCandidates([sceneSeed, ...seeds]) : [];
  const stockReactionQueries = provider !== "giphy" && intent === "meme" ? buildStockReactionQueriesFromRequest(request) : [];
  const providerBase =
    provider === "pexels"
      ? buildPexelsQuery(request, intent)
      : provider === "giphy"
        ? buildGiphyQuery(request, intent)
        : provider === "pixabay"
          ? buildPixabayQuery(request, intent)
          : sanitizedSeeds[0] || seeds[0] || request.query.trim();
  const englishSeedInputs =
    provider === "giphy" && signal.looksLikeSentence
      ? []
      : [...sanitizedSeeds, ...seeds, ...reactionShortcuts, ...visualFallbacks];
  const englishSeeds = dedupeQueries(
    englishSeedInputs
      .map((seed) => toEnglishHint(seed))
      .filter(Boolean)
  );
  const exactPhraseSeeds =
    provider === "giphy"
      ? dedupeQueries(
          (signal.looksLikeSentence ? sanitizedSeeds : querySeeds)
            .map((seed) => trimQueryLength(stripMemeSearchSuffix(seed)))
            .filter(Boolean)
        )
      : [];
  const baseQueries =
    provider === "giphy"
      ? [providerBase, ...englishSeeds, ...exactPhraseSeeds, ...buildNeutralBrollFallbacks(request)]
      : intent === "meme"
        ? [
            providerBase,
            ...stockReactionQueries,
            ...visualFallbacks,
            ...sanitizedSeeds.map((seed) => stripMemeSearchSuffix(seed)),
            ...englishSeeds,
            ...buildNeutralBrollFallbacks(request),
          ]
        : [providerBase, ...sanitizedSeeds, ...englishSeeds, ...buildNeutralBrollFallbacks(request)];
  return dedupeQueries(baseQueries).slice(0, 6);
}

function buildGiphyQueries(request: ImageRequest, intent: ProviderIntent): string[] {
  const baseQueries = buildProviderQueries("giphy", request, intent);
  const exactQueries = buildGiphyExactPhraseQueries(request);
  const signal = analyzeImageRequestSearchSignal(request);
  if (intent !== "meme") {
    return dedupeQueries([...exactQueries, ...baseQueries]).slice(0, 6);
  }
  const reactionQueries = buildGiphyReactionQueriesFromRequest(request);
  const prioritizeReactionQueries = signal.looksLikeSentence || signal.hasReactionCue;
  const prioritizedQueries = prioritizeReactionQueries
    ? [...reactionQueries, ...baseQueries, ...exactQueries]
    : [...exactQueries, ...reactionQueries, ...baseQueries];
  const expanded = dedupeQueries([
    ...prioritizedQueries,
  ]).map((query) => trimQueryLength(query));
  return expanded.slice(0, 10);
}

function buildSearchQuery(request: ImageRequest): string {
  const isFunLikeQuery = [request.query, request.scene || "", ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(String(value || "").trim()))
    .join(" ")
    .includes("짤");
  const shouldApplyMustAvoid = !isFunLikeQuery;
  const rawCandidates = [request.query, ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(value.trim()))
    .filter(Boolean);
  const preferredQuery =
    rawCandidates.find((candidate) => containsHangul(candidate)) ||
    rawCandidates[0] ||
    request.query.trim();
  const avoid = (request.mustAvoid ?? []).filter(Boolean).map((x) => `-${x}`);
  return [preferredQuery, ...(shouldApplyMustAvoid ? avoid : [])].join(" ").trim();
}

function resolveNaverImageFilter(request: ImageRequest, intent: ProviderIntent): "all" | "large" {
  const signal = analyzeImageRequestSearchSignal(request);
  if (intent === "news" || signal.hasConcreteVisualCue) {
    return "large";
  }
  return "all";
}

function probeCase(label: string, request: ImageRequest, intent: ProviderIntent): Record<string, unknown> {
  const signal = analyzeImageRequestSearchSignal(request);
  return {
    label,
    request,
    intent,
    signal: {
      primaryTokens: signal.primaryTokens,
      visualTokens: signal.visualTokens,
      emotionTokens: signal.emotionTokens,
      entityTokens: signal.entityTokens,
      hasMemeCue: signal.hasMemeCue,
      hasReactionCue: signal.hasReactionCue,
      hasConcreteVisualCue: signal.hasConcreteVisualCue,
      looksLikeSentence: signal.looksLikeSentence,
    },
    seedQueries: buildSeedQueries(request, { memeIntent: intent === "meme" }),
    allVariants: buildQueryVariantsFromRequest(request, { memeIntent: intent === "meme" }).slice(0, 12),
    giphyReactionQueries: buildGiphyReactionQueriesFromRequest(request),
    giphyExactPhraseQueries: buildGiphyExactPhraseQueries(request),
    giphyProviderQueries: buildProviderQueries("giphy", request, intent),
    giphyExpandedQueries: buildGiphyQueries(request, intent),
    naverProviderQueries: buildProviderQueries("naver", request, intent),
    naverSearchQuery: buildSearchQuery(request),
    naverFilter: resolveNaverImageFilter(request, intent),
    isCtaLike: includesCtaToken(request.query) || includesCtaToken(request.scene || ""),
  };
}

const cases: Array<{ label: string; request: ImageRequest; intent: ProviderIntent }> = [
  {
    label: "simple-surprise-no-space",
    request: { query: "놀람짤", plannerSource: "manual" },
    intent: "meme",
  },
  {
    label: "simple-surprise-with-space",
    request: { query: "놀람 짤", plannerSource: "manual" },
    intent: "meme",
  },
  {
    label: "simple-money-no-space",
    request: { query: "돈짤", plannerSource: "manual" },
    intent: "meme",
  },
  {
    label: "simple-money-with-space",
    request: { query: "돈 짤", plannerSource: "manual" },
    intent: "meme",
  },
  {
    label: "simple-money-en",
    request: { query: "money", plannerSource: "manual" },
    intent: "meme",
  },
  {
    label: "sentence-surprise",
    request: {
      query: "갑자기 문이 열려서 깜짝 놀람",
      scene: "어두운 복도 문틈에서 불빛이 새는 장면",
      plannerSource: "codex",
    },
    intent: "meme",
  },
  {
    label: "sentence-money",
    request: {
      query: "매출 들어오자 갑자기 텐션 올라감",
      queryCandidates: ["돈 짤", "대박 반응"],
      plannerSource: "codex",
    },
    intent: "meme",
  },
  {
    label: "sentence-receipt-freeze",
    request: {
      query: "영수증 보고 사장님 표정 굳음",
      scene: "영수증을 들고 표정이 굳은 사람",
      plannerSource: "codex",
    },
    intent: "meme",
  },
];

const results = cases.map((item) => probeCase(item.label, item.request, item.intent));
console.log(JSON.stringify(results, null, 2));
