import type { ImageRequest, PublishCategory } from "@/types/studio-json";

export type VisualIntentProfileId =
  | "politics"
  | "story"
  | "knowledge"
  | "product"
  | "professional_service"
  | "generic";
export type VisualSearchIntent = "news" | "meme";

export type VisualIntent = {
  profileId: VisualIntentProfileId;
  category: PublishCategory;
  searchIntent: VisualSearchIntent;
  sceneHint: string;
  entityHints: string[];
  freshnessDays: number;
  facePolicy: "strict" | "loose" | "avoid";
  generationFallback: "never" | "low-score-only" | "allowed";
};

export type SearchQueryMode = "auto" | "fun" | "stock";

export type SearchQuerySignal = {
  primaryTokens: string[];
  visualTokens: string[];
  emotionTokens: string[];
  entityTokens: string[];
  hasMemeCue: boolean;
  hasReactionCue: boolean;
  hasConcreteVisualCue: boolean;
  hasProfessionalContext: boolean;
  looksLikeSentence: boolean;
};

const ATTACHED_MEME_SUFFIX_PATTERN = /([0-9\p{L}]+?)(움짤|짤|밈|gif)(?=$|\s|[^\p{L}\p{N}])/giu;
const HIGH_VALUE_SINGLE_CHAR_TOKENS = new Set(["돈"]);

const POLITICS_HINTS = [
  "정치",
  "대통령",
  "국회",
  "국민의힘",
  "민주당",
  "총리",
  "장관",
  "청와대",
  "대통령실",
  "선거",
  "지지율",
  "브리핑",
];

const STORY_HINTS = [
  "썰",
  "사연",
  "고민",
  "연애",
  "이별",
  "회사썰",
  "직장썰",
  "웃긴",
  "레전드",
  "반전",
  "밈",
  "짤",
  "움짤",
];

const KNOWLEDGE_HINTS = [
  "지식",
  "설명",
  "경제",
  "역사",
  "과학",
  "세금",
  "세무",
  "환급",
  "경정청구",
  "신고",
  "가산세",
  "홈택스",
];

const PROFESSIONAL_SERVICE_HINTS = [
  "세무",
  "회계",
  "세무사",
  "세무사무소",
  "법률",
  "변호사",
  "법무",
  "법무법인",
  "경정청구",
  "환급",
  "신고",
  "홈택스",
  "가산세",
  "상담",
  "서류",
  "증빙",
];

const PRODUCT_HINTS = [
  "it",
  "ai",
  "앱",
  "서비스",
  "제품",
  "툴",
  "기능",
  "업데이트",
  "리뷰",
];

const SEARCH_GENERIC_STOPWORDS = new Set([
  "사진",
  "이미지",
  "장면",
  "상황",
  "모습",
  "현장",
  "관련",
  "느낌",
  "이야기",
  "썰",
  "사연",
  "제목",
  "설명",
  "내용",
  "문장",
  "스토리",
  "게시글",
  "포스트",
  "캡처",
  "정리",
  "요약",
  "사람",
  "누군가",
  "뭔가",
  "무언가",
  "같은",
  "같다",
  "있는",
  "있는",
  "보이는",
  "작고",
  "작은",
  "귀여운",
  "귀엽",
  "이상한",
  "이상",
  "표정",
  "그냥",
  "근데",
  "그런데",
  "그리고",
  "그래서",
  "그러면",
  "약간",
  "진짜",
  "사실",
  "이거",
  "그거",
  "저거",
  "이게",
  "그게",
  "저게",
  "이건",
  "그건",
  "저건",
  "여기",
  "거기",
  "여기서",
  "거기서",
  "건데",
  "인데",
  "라고",
  "싶지",
  "있어",
  "없어",
]);

const MEME_SEARCH_TOKENS = new Set(["짤", "밈", "움짤", "gif", "reaction", "meme"]);
const PROFESSIONAL_CONTEXT_TOKENS = new Set([
  "자영업자",
  "소상공인",
  "사장",
  "사장님",
  "직장인",
  "회사원",
  "세무",
  "세금",
  "세무사",
  "세무사무소",
  "회계",
  "법률",
  "법무",
  "변호사",
  "환급",
  "경정청구",
  "상담",
  "업무",
  "서비스",
  "업체",
  "고객",
  "직원",
]);
const CONCRETE_VISUAL_TOKENS = new Set([
  "문",
  "문틈",
  "복도",
  "불빛",
  "방",
  "그림자",
  "실루엣",
  "영수증",
  "계산서",
  "계약서",
  "서류",
  "문서",
  "통장",
  "계좌",
  "계산기",
  "노트북",
  "컴퓨터",
  "스마트폰",
  "휴대폰",
  "문자",
  "카톡",
  "채팅",
  "홈택스",
  "브리핑",
  "기자회견",
  "회의장",
  "국회",
  "화면",
  "책상",
  "오피스",
  "사무실",
  "복도",
  "door",
  "hallway",
  "shadow",
  "silhouette",
  "receipt",
  "document",
  "paperwork",
  "phone",
  "screen",
  "laptop",
  "office",
]);
const ENTITY_STOPWORDS = new Set([
  ...SEARCH_GENERIC_STOPWORDS,
  ...MEME_SEARCH_TOKENS,
  ...PROFESSIONAL_CONTEXT_TOKENS,
  ...CONCRETE_VISUAL_TOKENS,
  "놀람",
  "충격",
  "경악",
  "당황",
  "민망",
  "황당",
  "어이없음",
  "분노",
  "웃김",
  "폭소",
  "슬픔",
  "우울",
  "공포",
  "무서움",
  "고민",
  "불안",
  "여유",
  "당당",
  "자신만만",
]);
const SEARCH_SENTENCE_PATTERNS = [
  /누군가/u,
  /뭔가/u,
  /같은/u,
  /느낌/u,
  /처럼/u,
  /있는/u,
  /보이는/u,
  /이었다/u,
  /했다/u,
  /한다/u,
  /하게/u,
  /이라는/u,
  /라는/u,
];
const REACTION_CUE_HINTS = [
  "놀람",
  "충격",
  "경악",
  "당황",
  "민망",
  "황당",
  "어이없음",
  "분노",
  "웃김",
  "폭소",
  "슬픔",
  "우울",
  "공포",
  "무서움",
  "고민",
  "불안",
  "여유",
  "당당",
  "자신",
  "깜놀",
  "헉",
  "정색",
  "멘붕",
  "현타",
  "식은땀",
  "억울",
  "수상",
  "의심",
  "찝찝",
  "쎄한",
];
const REACTION_QUERY_RULES: Array<{ hints: string[]; keywords: string[] }> = [
  { hints: ["기쁨", "기쁜", "행복", "행복함", "즐거움", "즐거운", "신남", "신난"], keywords: ["기쁨 짤", "행복 짤", "신난 짤"] },
  { hints: ["여유", "느긋", "편안", "평온", "안심", "안도"], keywords: ["여유 짤", "안심 짤", "느긋 짤"] },
  { hints: ["자신", "당당", "자신감", "자신만만", "뿌듯", "우쭐", "의기양양"], keywords: ["자신만만 짤", "당당 짤", "우쭐 짤"] },
  { hints: ["당황", "민망", "어색", "뻘쭘", "식은땀"], keywords: ["당황 짤", "민망 짤", "어색 짤"] },
  { hints: ["놀람", "충격", "경악", "헉", "깜놀", "벙찜"], keywords: ["놀람 짤", "충격 짤", "경악 짤"] },
  { hints: ["분노", "화남", "열받", "빡침", "짜증"], keywords: ["분노 짤", "화남 짤", "빡침 짤"] },
  { hints: ["황당", "어이없", "답답", "한숨", "허탈"], keywords: ["황당 짤", "어이없음 짤", "답답 짤"] },
  { hints: ["웃김", "웃긴", "폭소", "웃음", "터짐"], keywords: ["웃김 짤", "폭소 짤", "웃음 짤"] },
  { hints: ["슬픔", "우울", "눈물", "울컥"], keywords: ["슬픔 짤", "눈물 짤", "우울 짤"] },
  { hints: ["공포", "무섭", "오싹", "소름", "섬뜩", "철렁", "깜깜"], keywords: ["무서움 짤", "소름 짤", "공포 짤"] },
  { hints: ["고민", "걱정", "불안", "초조"], keywords: ["고민 짤", "불안 짤", "초조 짤"] },
  { hints: ["정색", "굳음", "얼음", "싸해", "싸한", "무표정"], keywords: ["정색 짤", "얼음 짤", "싸한 짤"] },
  { hints: ["멘붕", "멍함", "멍", "현타", "머리 하얘"], keywords: ["멘붕 짤", "현타 짤", "멍한 짤"] },
  { hints: ["식은땀", "진땀", "쫄림", "쫄려", "긴장"], keywords: ["식은땀 짤", "긴장 짤", "쫄린 짤"] },
  { hints: ["억울", "분통", "답답", "한숨"], keywords: ["억울 짤", "답답 짤", "한숨 짤"] },
  { hints: ["수상", "의심", "찝찝", "쎄한", "촉"], keywords: ["의심 짤", "수상한 짤", "쎄한 짤"] },
];
const VISUAL_QUERY_RULES: Array<{ hints: string[]; keywords: string[] }> = [
  { hints: ["문틈", "문", "복도", "불빛"], keywords: ["문틈 불빛", "복도 불빛", "방 안 불빛"] },
  { hints: ["그림자", "실루엣", "귀신", "형체"], keywords: ["복도 그림자", "사람 실루엣", "어두운 그림자"] },
  { hints: ["영수증", "계산서", "결제"], keywords: ["영수증 사진", "카드 영수증 사진", "영수증 클로즈업"] },
  { hints: ["계약서", "서류", "문서", "증빙"], keywords: ["서류 사진", "계약서 사진", "문서 클로즈업"] },
  { hints: ["스마트폰", "휴대폰", "문자", "카톡", "채팅"], keywords: ["스마트폰 화면", "문자 화면", "카톡 대화창"] },
  { hints: ["통장", "계좌", "은행"], keywords: ["통장 사진", "계좌 화면", "은행 앱 화면"] },
  { hints: ["퇴직금", "연금", "적립", "납입"], keywords: ["통장 사진", "계좌 화면", "계산기 사진"] },
  { hints: ["퇴직", "퇴사", "사직"], keywords: ["사직서 사진", "빈 사무실 책상", "통장 사진"] },
  { hints: ["돈", "현금", "자금"], keywords: ["현금 사진", "돈다발 사진", "지갑 현금"] },
  { hints: ["홈택스", "세금"], keywords: ["홈택스 화면", "세금 서류 사진", "노트북 홈택스 화면"] },
  { hints: ["계산기", "정산"], keywords: ["계산기 사진", "계산기 클로즈업", "책상 계산기"] },
  { hints: ["국회", "브리핑", "기자회견", "회의"], keywords: ["국회 회의장 사진", "브리핑 현장 사진", "기자회견 사진"] },
];

type SearchSignalInput = string | Pick<ImageRequest, "query" | "queryCandidates" | "scene" | "people">;

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!out.includes(compact)) out.push(compact);
  }
  return out;
}

export function normalizeSearchText(value: string): string {
  return normalizeMemeSearchPhrase(value).replace(/\s+/g, " ").trim();
}

export function normalizeMemeSearchPhrase(value: string): string {
  return value.replace(ATTACHED_MEME_SUFFIX_PATTERN, "$1 $2");
}

export function stripMemeSearchSuffix(value: string): string {
  return normalizeMemeSearchPhrase(value).replace(/\s+(짤|밈|움짤|gif)$/iu, "").trim();
}

function normalizeSearchToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/^[^0-9\p{L}]+|[^0-9\p{L}]+$/gu, "")
    .replace(/(스럽게|스럽다|스러운|로운|러운|하게|했던|하는|한다|했다|한)$/u, "");
}

function isDateLikeToken(token: string): boolean {
  return /^(20\d{2}년?|20\d{2}|\d{1,2}월|\d{1,2}일)$/u.test(token);
}

function shouldKeepSearchToken(token: string): boolean {
  if (token.length >= 2) return true;
  return (
    MEME_SEARCH_TOKENS.has(token) ||
    CONCRETE_VISUAL_TOKENS.has(token) ||
    PROFESSIONAL_CONTEXT_TOKENS.has(token) ||
    HIGH_VALUE_SINGLE_CHAR_TOKENS.has(token)
  );
}

export function tokenizeSearchTerms(value: string): string[] {
  return dedupeStrings(
    normalizeSearchText(value)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((token) => normalizeSearchToken(token))
      .filter((token) => shouldKeepSearchToken(token))
      .filter((token) => !isDateLikeToken(token))
  );
}

function looksLikeSentenceCandidate(value: string): boolean {
  const compact = normalizeSearchText(value);
  if (!compact) return false;
  const tokenCount = compact.split(/\s+/).filter(Boolean).length;
  const lower = compact.toLowerCase();
  if (tokenCount >= 5 && !MEME_SEARCH_TOKENS.has(lower)) return true;
  return SEARCH_SENTENCE_PATTERNS.some((pattern) => pattern.test(compact));
}

function toSignalValues(input: SearchSignalInput): string[] {
  if (typeof input === "string") return [input];
  return [input.query || "", ...(input.queryCandidates || []), input.scene || "", ...(input.people || [])].filter(Boolean);
}

export function buildShortReactionSearchCandidates(values: string[]): string[] {
  const corpus = normalizeSearchText(values.join(" ")).toLowerCase();
  if (!corpus) return [];
  const out: string[] = [];
  for (const rule of REACTION_QUERY_RULES) {
    if (!rule.hints.some((hint) => corpus.includes(hint.toLowerCase()))) continue;
    for (const keyword of rule.keywords) {
      if (!out.includes(keyword)) out.push(keyword);
    }
  }
  return out.slice(0, 6);
}

export function buildConcreteVisualSearchCandidates(values: string[]): string[] {
  const corpus = normalizeSearchText(values.join(" ")).toLowerCase();
  if (!corpus) return [];
  const out: string[] = [];
  for (const rule of VISUAL_QUERY_RULES) {
    if (!rule.hints.some((hint) => corpus.includes(hint.toLowerCase()))) continue;
    for (const keyword of rule.keywords) {
      if (!out.includes(keyword)) out.push(keyword);
    }
  }
  return out.slice(0, 8);
}

export function analyzeImageRequestSearchSignal(input: SearchSignalInput): SearchQuerySignal {
  const values = toSignalValues(input);
  const primaryTokens = dedupeStrings(values.flatMap((value) => tokenizeSearchTerms(value)));
  const corpus = normalizeSearchText(values.join(" ")).toLowerCase();
  const emotionTokens = dedupeStrings(
    buildShortReactionSearchCandidates(values)
      .flatMap((value) => tokenizeSearchTerms(value))
      .filter((token) => !MEME_SEARCH_TOKENS.has(token))
  );
  const visualTokens = dedupeStrings(
    [
      ...buildConcreteVisualSearchCandidates(values).flatMap((value) => tokenizeSearchTerms(value)),
      ...primaryTokens.filter((token) => CONCRETE_VISUAL_TOKENS.has(token)),
    ]
  );
  const entityTokens = primaryTokens.filter((token) => !ENTITY_STOPWORDS.has(token)).slice(0, 4);
  const hasMemeCue = primaryTokens.some((token) => MEME_SEARCH_TOKENS.has(token));
  const hasReactionCue =
    emotionTokens.length > 0 ||
    primaryTokens.some((token) =>
      REACTION_CUE_HINTS.some((hint) =>
        token.includes(hint)
      )
    );
  const hasConcreteVisualCue = visualTokens.length > 0;
  const hasProfessionalContext = primaryTokens.some((token) => PROFESSIONAL_CONTEXT_TOKENS.has(token));
  const looksLikeSentence = values.some((value) => looksLikeSentenceCandidate(value));

  return {
    primaryTokens,
    visualTokens,
    emotionTokens,
    entityTokens,
    hasMemeCue,
    hasReactionCue,
    hasConcreteVisualCue,
    hasProfessionalContext,
    looksLikeSentence,
  };
}

export function sanitizeSearchQueryCandidate(
  value: string,
  options?: { mode?: SearchQueryMode; allowMemeTerms?: boolean; maxTokens?: number }
): string {
  const raw = normalizeSearchText(value);
  if (!raw) return "";
  const mode = options?.mode || "auto";
  const signal = analyzeImageRequestSearchSignal(raw);
  const tokens = tokenizeSearchTerms(raw)
    .filter((token) => !SEARCH_GENERIC_STOPWORDS.has(token))
    .filter((token) => !(mode === "fun" && signal.hasReactionCue && PROFESSIONAL_CONTEXT_TOKENS.has(token)))
    .filter((token) => !(mode === "fun" && signal.looksLikeSentence && token.length <= 2))
    .filter((token) => !MEME_SEARCH_TOKENS.has(token));
  const maxTokens = Math.max(
    2,
    Math.min(6, Math.floor(options?.maxTokens || (mode === "fun" ? (signal.hasConcreteVisualCue ? 4 : 3) : 4)))
  );
  let compact = dedupeStrings(tokens).slice(0, maxTokens).join(" ").trim();
  if (!compact && mode === "fun") {
    return buildShortReactionSearchCandidates([raw])[0] || buildConcreteVisualSearchCandidates([raw])[0] || "";
  }
  if (!compact) return "";
  const rawTokens = tokenizeSearchTerms(raw);
  const shouldAppendMemeSuffix =
    Boolean(options?.allowMemeTerms) &&
    !signal.hasConcreteVisualCue &&
    (rawTokens.some((token) => MEME_SEARCH_TOKENS.has(token)) || (mode === "fun" && signal.hasReactionCue));
  if (shouldAppendMemeSuffix && !/(짤|밈|움짤|gif)$/u.test(compact)) {
    compact = `${compact} 짤`;
  }
  return compact;
}

function toCorpus(category: PublishCategory | undefined, text: string, request: ImageRequest): string {
  return [
    category || "",
    text || "",
    request.query || "",
    request.scene || "",
    ...(request.people || []),
    ...(request.queryCandidates || []),
  ]
    .join(" ")
    .toLowerCase();
}

function hasAnyHint(corpus: string, hints: string[]): boolean {
  return hints.some((hint) => corpus.includes(hint.toLowerCase()));
}

function extractEntityHints(request: ImageRequest): string[] {
  const signal = analyzeImageRequestSearchSignal(request);
  return signal.entityTokens.slice(0, 3);
}

export function inferVisualIntent(input: {
  category?: PublishCategory;
  text: string;
  request: ImageRequest;
}): VisualIntent {
  const category = String(input.category || "").trim();
  const corpus = toCorpus(category, input.text, input.request);
  const sceneHint =
    sanitizeSearchQueryCandidate(String(input.request.scene || "").trim(), {
      mode: "stock",
      allowMemeTerms: false,
      maxTokens: 4,
    }) ||
    String(input.request.scene || "").trim() ||
    "일반 장면";
  const entityHints = extractEntityHints(input.request);

  if (hasAnyHint(corpus, POLITICS_HINTS)) {
    return {
      profileId: "politics",
      category,
      searchIntent: "news",
      sceneHint,
      entityHints,
      freshnessDays: 7,
      facePolicy: "strict",
      generationFallback: "low-score-only",
    };
  }

  if (hasAnyHint(corpus, STORY_HINTS)) {
    return {
      profileId: "story",
      category,
      searchIntent: "meme",
      sceneHint,
      entityHints,
      freshnessDays: 60,
      facePolicy: "avoid",
      generationFallback: "allowed",
    };
  }

  if (hasAnyHint(corpus, PROFESSIONAL_SERVICE_HINTS)) {
    return {
      profileId: "professional_service",
      category,
      searchIntent: "news",
      sceneHint,
      entityHints,
      freshnessDays: 21,
      facePolicy: "avoid",
      generationFallback: "low-score-only",
    };
  }

  if (hasAnyHint(corpus, KNOWLEDGE_HINTS)) {
    return {
      profileId: "knowledge",
      category,
      searchIntent: "news",
      sceneHint,
      entityHints,
      freshnessDays: 30,
      facePolicy: "loose",
      generationFallback: "low-score-only",
    };
  }

  if (hasAnyHint(corpus, PRODUCT_HINTS)) {
    return {
      profileId: "product",
      category,
      searchIntent: "news",
      sceneHint,
      entityHints,
      freshnessDays: 30,
      facePolicy: "loose",
      generationFallback: "allowed",
    };
  }

  return {
    profileId: "generic",
    category,
    searchIntent: "meme",
    sceneHint,
    entityHints,
    freshnessDays: 45,
    facePolicy: "avoid",
    generationFallback: "allowed",
  };
}
