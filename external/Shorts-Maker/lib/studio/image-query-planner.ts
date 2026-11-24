import { resolveDefaultLocalCodexCliModel, runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { runCodexPlannerWithRetry } from "@/lib/studio/codex-planner-retry";
import { canUseLocalCodexCliBridge, getCodexModel, requestCodexChatCompletion } from "@/lib/studio/codex-script-transport";
import {
  DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES,
  dedupeGiphyQueriesByFamily,
  isGiphySearchableQuery,
  normalizeGiphySearchQuery,
} from "@/lib/studio/giphy-query-utils";
import { buildGiphyReactionQueriesFromRequest } from "@/lib/studio/image-provider-resolver-helpers";
import { toKoreanNaverQuery } from "@/lib/studio/image-resolver";
import { applyImageSelectionPlanningPolicy } from "@/lib/studio/image-selection-policy";
import { toEnglishHint } from "@/lib/studio/query-translation";
import {
  analyzeImageRequestSearchSignal,
  buildConcreteVisualSearchCandidates,
  buildShortReactionSearchCandidates,
  sanitizeSearchQueryCandidate,
  tokenizeSearchTerms,
} from "@/lib/studio/images/intent";
import type { ImageProviderId, ImageRequest, SlideInput, StudioPrepareRequest } from "@/types/studio-json";

const DEFAULT_MODEL = (process.env.CODEX_MODEL || "").trim() || "gpt-4.1-mini";
const DEFAULT_CODEX_IMAGE_PLANNER_BATCH_SIZE = 4;
const DEFAULT_CODEX_IMAGE_PLANNER_TIMEOUT_MS = 1000 * 90;
const DEFAULT_CODEX_IMAGE_PLANNER_PARTIAL_RETRY_ATTEMPTS = 3;
const IMAGE_PLANNER_RETRY_OPTIONS = { maxAttempts: 2, initialDelayMs: 900 } as const;
const IMAGE_PLANNER_FAST_CONFIG_OVERRIDES = ['service_tier="fast"'];
const DEFAULT_MUST_AVOID = ["워터마크", "로고", "썸네일"];
const FUN_MODE_MUST_AVOID: string[] = [];
const QUESTION_PATTERNS = [/왜/u, /싶지/u, /뭐냐고/u];
const SERIOUS_PATTERNS = [/법은/u, /다르게 봐/u, /판단/u, /성립/u, /될 수 있어/u];
const LEGAL_PATTERNS = [/형법/u, /범죄/u, /업무방해/u, /형사/u, /사건/u, /위계/u, /법은/u];
const RESERVATION_PATTERNS = [/노쇼/u, /예약/u, /갈 생각 없이/u, /갈 것처럼/u, /안 간/u];
const PHONE_PATTERNS = [/연락/u, /문자/u, /카톡/u, /전화/u, /끊은/u, /답장/u];
const RESTAURANT_PATTERNS = [/식당/u, /자리/u, /손님/u, /가게/u];
const RISK_PATTERNS = [/위험/u, /위험해/u, /주의/u];
const DECEPTION_PATTERNS = [/속일/u, /착각/u, /위계/u, /갈 것처럼/u, /처음부터/u];
const LOSS_PATTERNS = [/못 받은/u, /빼놓게/u, /피해/u, /업무를 방해/u];
const REPEAT_PATTERNS = [/반복/u, /여러 가게/u, /동시 예약/u, /패턴/u];
const CTA_PATTERNS = [/고정댓글/u, /상담문의/u, /문의정보/u, /댓글 확인/u, /링크 확인/u];
const SWITCH_LINE_PATTERNS = [/반대로/u, /하지만/u, /근데/u, /그런데/u, /그러면/u, /그때/u, /결국/u, /나중에/u];
const RETIREMENT_PATTERNS = [/퇴직금/u, /퇴직연금/u, /연금/u];
const ACCOUNT_PATTERNS = [/통장/u, /계좌/u, /입금/u, /납입/u, /적립/u];
const DOCUMENT_PATTERNS = [/서류/u, /문서/u, /증빙/u, /계약서/u, /영수증/u, /계산서/u];
const PAYROLL_PATTERNS = [/정산/u, /급여/u, /명세/u, /계산/u];
const TAX_PATTERNS = [/세금/u, /법인세/u, /절세/u, /세무/u, /회계/u];
const EXIT_PATTERNS = [/퇴사/u, /사직/u, /그만두/u];
const CASH_PATTERNS = [/돈/u, /현금/u, /자금/u, /지갑/u];
const SCHEDULE_PATTERNS = [/미리/u, /준비/u, /시기/u, /언제/u, /먼저/u, /나중/u, /기한/u];
const STAFF_PATTERNS = [/직원/u, /사장/u, /대표/u, /사장님/u, /근로자/u];
const DIRECT_VISUAL_QUERY_TOKENS = new Set([
  "사진",
  "장면",
  "현장",
  "사무실",
  "책상",
  "회의실",
  "회의",
  "브리핑",
  "기자회견",
  "국회",
  "식당",
  "가게",
  "테이블",
  "자리",
  "빈자리",
  "문서",
  "서류",
  "계약서",
  "영수증",
  "통장",
  "계좌",
  "은행",
  "계산기",
  "노트북",
  "컴퓨터",
  "화면",
  "스마트폰",
  "휴대폰",
  "문자",
  "카톡",
  "채팅",
  "복도",
  "문틈",
  "불빛",
  "그림자",
  "실루엣",
  "포스터",
  "간판",
]);
const PERSON_ROLE_QUERY_TOKENS = new Set([
  "사장님",
  "사장",
  "직원",
  "손님",
  "고객",
  "사람",
  "남성",
  "여성",
  "남자",
  "여자",
  "부부",
  "가족",
  "학생",
  "직장인",
  "사업자",
  "자영업",
]);
const ABSTRACT_STOCK_QUERY_TOKENS = new Set([
  "준비",
  "마련",
  "처리",
  "정산",
  "적립",
  "절세",
  "퇴사",
  "시기",
  "비용",
  "증가",
  "감소",
  "판단",
  "가능",
  "대비",
  "대응",
  "관리",
  "활용",
  "검토",
  "신청",
  "납입",
  "입금",
  "별도적립",
  "손금산입",
  "갑작",
  "갑자기",
  "한번에",
  "미리",
]);

type PlannedImageItem = {
  slideIndex: number;
  provider?: "naver" | "giphy";
  scene?: string;
  people?: string[];
  queryCandidates: string[];
  switchAtLineIndex?: number;
  switchProvider?: "naver" | "giphy";
  switchScene?: string;
  switchPeople?: string[];
  switchQueryCandidates?: string[];
  switchReason?: string;
};

type PlannedImageResponse = {
  items: PlannedImageItem[];
};

type PlannerSourceKind = "codex" | "heuristic";

type PlannerSlideRow = {
  slideIndex: number;
  title: string;
  text: string;
  lines: string[];
};

type HeuristicFlags = {
  question: boolean;
  serious: boolean;
  legal: boolean;
  reservation: boolean;
  phone: boolean;
  restaurant: boolean;
  risk: boolean;
  deception: boolean;
  loss: boolean;
  repeatPattern: boolean;
  cta: boolean;
};

type PlanResult = {
  payload: StudioPrepareRequest;
  warnings: string[];
};

type PlannerPromptOptions = {
  hint?: string;
  category?: string;
  crawlMode?: StudioPrepareRequest["crawlMode"];
  codexModel?: string;
};

type ImagePlannerTransportOverrides = {
  canUseLocalCliBridge?: (codexAccessToken?: string) => boolean;
  planByCodexCli?: (slides: PlannerSlideRow[], options?: PlannerPromptOptions) => Promise<PlannedImageResponse>;
  planByCodexApi?: (
    slides: PlannerSlideRow[],
    codexAccessToken: string,
    options?: PlannerPromptOptions
  ) => Promise<PlannedImageResponse>;
};

type PlannerProvider = "naver" | "giphy";

const IMAGE_PLANNER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "slideIndex",
          "provider",
          "scene",
          "people",
          "queryCandidates",
          "switchAtLineIndex",
          "switchProvider",
          "switchScene",
          "switchPeople",
          "switchQueryCandidates",
          "switchReason",
        ],
        properties: {
          slideIndex: { type: "integer", minimum: 0 },
          provider: { type: "string", enum: ["naver", "giphy"] },
          scene: { type: ["string", "null"] },
          people: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          queryCandidates: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          switchAtLineIndex: { type: ["integer", "null"], minimum: 1 },
          switchProvider: { type: ["string", "null"], enum: ["naver", "giphy", null] },
          switchScene: { type: ["string", "null"] },
          switchPeople: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          switchQueryCandidates: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          switchReason: { type: ["string", "null"] },
        },
      },
    },
  },
};

function getPrimaryImageBeat(slide: SlideInput): NonNullable<SlideInput["imageBeats"]>[number] | undefined {
  if (!Array.isArray(slide.imageBeats)) return undefined;
  return slide.imageBeats
    .filter((beat) => Number.isFinite(beat.startLineIndex) && beat.startLineIndex >= 0)
    .slice()
    .sort((left, right) => left.startLineIndex - right.startLineIndex)[0];
}

function collapseSlideToSingleImage(slide: SlideInput): SlideInput {
  const hasExplicitMediaBeat = Array.isArray(slide.imageBeats) && slide.imageBeats.some(
    (beat) =>
      beat.clearVisual === true ||
      Boolean(normalizeWhitespace(String(beat.imageUrl || beat.resolvedImageUrl || beat.mediaUrl || "")))
  );
  if (hasExplicitMediaBeat) return slide;
  const primaryBeat = getPrimaryImageBeat(slide);
  if (!primaryBeat && !slide.imageBeats) return slide;
  return {
    ...slide,
    imageRequest: slide.imageRequest || primaryBeat?.imageRequest,
    imageUrl: slide.imageUrl || primaryBeat?.imageUrl || primaryBeat?.resolvedImageUrl,
    imageBeats: undefined,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePlannerProvider(value: unknown): PlannerProvider | undefined {
  const normalized = normalizeWhitespace(typeof value === "string" ? value : "").toLowerCase();
  return normalized === "naver" || normalized === "giphy" ? normalized : undefined;
}

function inferPlannerProviderFromQueries(values: string[]): PlannerProvider | undefined {
  const normalized = dedupeValues(values);
  if (normalized.length <= 0) return undefined;
  const signal = analyzeImageRequestSearchSignal({
    query: normalized[0] || "",
    queryCandidates: normalized.slice(1),
    scene: normalized[0] || "",
  });
  const giphyCandidates = normalized
    .map((value) => normalizeGiphySearchQuery(value))
    .filter(isGiphySearchableQuery);
  if (giphyCandidates.length > 0 && (signal.hasReactionCue || !signal.hasConcreteVisualCue)) return "giphy";
  if (signal.hasConcreteVisualCue && !signal.hasReactionCue) return "naver";
  if (normalized.some((value) => /[가-힣]/u.test(value))) return "naver";
  if (giphyCandidates.length > 0 || normalized.some((value) => /[a-z]/i.test(value) && !/[가-힣]/u.test(value))) return "giphy";
  return undefined;
}

function inferPlannerProviderFromImageRequest(request?: ImageRequest): PlannerProvider | undefined {
  const preferred = normalizePlannerProvider(request?.preferredProviders?.[0]);
  if (preferred) return preferred;
  const candidates = dedupeValues([request?.query || "", ...(request?.queryCandidates || [])]);
  if (candidates.length <= 0) return undefined;
  return inferPlannerProviderFromQueries(candidates);
}

function toPreferredProviders(provider?: PlannerProvider): ImageProviderId[] | undefined {
  return provider ? [provider] : undefined;
}

function resolveQueryModeForProvider(
  provider?: ImageProviderId
): "auto" | "fun" | "stock" {
  const normalizedProvider = normalizePlannerProvider(provider);
  if (normalizedProvider === "giphy") return "fun";
  if (normalizedProvider === "naver") return "stock";
  return "auto";
}

function dedupeValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = normalizeWhitespace(value);
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function hasSearchableLetters(value: string): boolean {
  return /[\p{L}]/u.test(normalizeWhitespace(value));
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  const compact = normalizeWhitespace(value);
  if (!compact) return false;
  return patterns.some((pattern) => pattern.test(compact));
}

function normalizeEnglishQueryPhrase(value: string): string {
  const compact = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  const tokens = compact.split(/\s+/).filter(Boolean).slice(0, 4);
  if (tokens.length < 2) return "";
  return tokens.join(" ");
}

function normalizeEnglishRoot(value: string): string {
  const compact = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  return compact.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

function pushUniqueValues(target: string[], values: string[]): void {
  for (const value of values) {
    const compact = normalizeWhitespace(value);
    if (!compact) continue;
    if (!target.includes(compact)) target.push(compact);
  }
}

function chunkItems<T>(items: T[], batchSize: number): T[][] {
  if (items.length <= 0) return [];
  const resolvedBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += resolvedBatchSize) {
    batches.push(items.slice(index, index + resolvedBatchSize));
  }
  return batches;
}

function resolvePlannerPartialRetryAttempts(): number {
  const envRaw = Number(process.env.STUDIO_IMAGE_QUERY_PLANNER_PARTIAL_RETRY_ATTEMPTS || "");
  if (Number.isFinite(envRaw)) {
    return Math.max(1, Math.min(6, Math.floor(envRaw)));
  }
  return DEFAULT_CODEX_IMAGE_PLANNER_PARTIAL_RETRY_ATTEMPTS;
}

function normalizeBatchPlannedResponse(
  planned: PlannedImageResponse,
  batchSlides: PlannerSlideRow[]
): { items: PlannedImageItem[]; rawSlideIndexes: number[]; remappedRawSlideIndexes: number[] } {
  const expectedSet = new Set(batchSlides.map((slide) => slide.slideIndex));
  const normalizedItems: PlannedImageItem[] = [];
  const seenSlideIndexes = new Set<number>();
  const rawSlideIndexes = planned.items.map((item) => item.slideIndex);
  const remappedRawSlideIndexes: number[] = [];

  for (const item of planned.items) {
    const rawSlideIndex = item.slideIndex;
    let resolvedSlideIndex = rawSlideIndex;
    if (!expectedSet.has(rawSlideIndex) && rawSlideIndex >= 0 && rawSlideIndex < batchSlides.length) {
      const batchSlideIndex = batchSlides[rawSlideIndex]?.slideIndex;
      if (Number.isFinite(batchSlideIndex)) {
        resolvedSlideIndex = Number(batchSlideIndex);
        if (resolvedSlideIndex !== rawSlideIndex) remappedRawSlideIndexes.push(rawSlideIndex);
      }
    }
    if (!expectedSet.has(resolvedSlideIndex) || seenSlideIndexes.has(resolvedSlideIndex)) continue;
    normalizedItems.push(
      resolvedSlideIndex === rawSlideIndex
        ? item
        : {
            ...item,
            slideIndex: resolvedSlideIndex,
          }
    );
    seenSlideIndexes.add(resolvedSlideIndex);
  }

  return {
    items: normalizedItems,
    rawSlideIndexes,
    remappedRawSlideIndexes,
  };
}

function resolvePlannerBatchSize(explicitBatchSize?: number): number {
  if (Number.isFinite(explicitBatchSize)) {
    return Math.max(1, Math.min(12, Math.floor(Number(explicitBatchSize))));
  }
  const envRaw = Number(process.env.STUDIO_IMAGE_QUERY_PLANNER_BATCH_SIZE || "");
  if (Number.isFinite(envRaw)) {
    return Math.max(1, Math.min(12, Math.floor(envRaw)));
  }
  return DEFAULT_CODEX_IMAGE_PLANNER_BATCH_SIZE;
}

function resolvePlannerTimeoutMs(): number {
  const envRaw = Number(process.env.STUDIO_IMAGE_QUERY_PLANNER_TIMEOUT_MS || "");
  if (Number.isFinite(envRaw)) {
    return Math.max(15_000, Math.min(10 * 60 * 1000, Math.floor(envRaw)));
  }
  return DEFAULT_CODEX_IMAGE_PLANNER_TIMEOUT_MS;
}

function resolveImagePlannerCliModel(): string {
  return (process.env.STUDIO_IMAGE_QUERY_PLANNER_CODEX_MODEL || "").trim() || resolveDefaultLocalCodexCliModel();
}

function isEnglishLikePlannerQuery(value: string): boolean {
  return /[a-z]/i.test(value) && !/[가-힣]/u.test(value);
}

function isLikelyReactionQuery(value: string): boolean {
  const lower = normalizeWhitespace(value).toLowerCase();
  if (!lower) return false;
  return [
    "reaction",
    "face",
    "smile",
    "wtf",
    "shocked",
    "surprised",
    "awkward",
    "worried",
    "suspicious",
    "confused",
    "serious",
    "deadpan",
    "frustrated",
    "angry",
    "happy",
    "laughing",
    "crying",
    "stunned",
    "side eye",
    "relieved",
    "scared",
  ].some((token) => lower.includes(token));
}

function toEnglishPlannerCandidates(values: string[]): string[] {
  return dedupeValues(
    values
      .map((value) => normalizeEnglishQueryPhrase(toEnglishHint(value) || value))
      .filter((value) => Boolean(value) && isEnglishLikePlannerQuery(value))
  );
}

function readHeuristicFlags(value: string): HeuristicFlags {
  return {
    question: matchesAny(value, QUESTION_PATTERNS),
    serious: matchesAny(value, SERIOUS_PATTERNS),
    legal: matchesAny(value, LEGAL_PATTERNS),
    reservation: matchesAny(value, RESERVATION_PATTERNS),
    phone: matchesAny(value, PHONE_PATTERNS),
    restaurant: matchesAny(value, RESTAURANT_PATTERNS),
    risk: matchesAny(value, RISK_PATTERNS),
    deception: matchesAny(value, DECEPTION_PATTERNS),
    loss: matchesAny(value, LOSS_PATTERNS),
    repeatPattern: matchesAny(value, REPEAT_PATTERNS),
    cta: matchesAny(value, CTA_PATTERNS),
  };
}

function getPlannerSlideText(slide: PlannerSlideRow): string {
  return normalizeWhitespace([slide.text, ...slide.lines].join(" "));
}

function buildHeuristicQuerySet(params: {
  reaction: string;
  sceneNoun: string;
  visual: string;
  alternates?: string[];
  crawlMode?: StudioPrepareRequest["crawlMode"];
  preferVisualFirst?: boolean;
}): { scene: string; queryCandidates: string[] } {
  const reaction = normalizeEnglishQueryPhrase(params.reaction) || "serious reaction";
  const sceneNoun = normalizeEnglishQueryPhrase(params.sceneNoun) || "paperwork desk";
  const visual = normalizeEnglishQueryPhrase(params.visual) || sceneNoun;
  const reactionRoot = normalizeEnglishRoot(reaction.replace(/\s+(reaction|face|smile)$/i, "")) || "serious";
  const reactionScene = normalizeEnglishQueryPhrase(`${reactionRoot} ${sceneNoun}`);
  const ordered =
    params.crawlMode === "stock"
      ? [visual, ...(params.alternates || []), reactionScene, reaction]
      : params.preferVisualFirst
        ? [visual, ...(params.alternates || []), reactionScene, reaction]
      : [reaction, reactionScene, visual, ...(params.alternates || [])];
  const queryCandidates = dedupeValues(ordered.map((value) => normalizeEnglishQueryPhrase(value)).filter(Boolean)).slice(0, 3);
  return {
    scene: visual,
    queryCandidates: queryCandidates.length > 0 ? queryCandidates : [visual],
  };
}

function resolveFunHeuristicReaction(flags: {
  segment: HeuristicFlags;
  slide: HeuristicFlags;
  context: HeuristicFlags;
}): string {
  if (flags.segment.deception || flags.context.deception) return "suspicious reaction";
  if (flags.segment.risk || flags.slide.risk || flags.context.risk) return "worried reaction";
  if (flags.segment.question || flags.context.question) return "confused reaction";
  if (flags.segment.legal || flags.slide.legal || flags.context.serious) return "deadpan serious face";
  return "awkward reaction";
}

function buildFunHeuristicSceneBundle(params: {
  segmentText: string;
  slideText: string;
  contextText: string;
  segmentLines: string[];
  segmentFlags: HeuristicFlags;
  slideFlags: HeuristicFlags;
  contextFlags: HeuristicFlags;
  crawlMode?: StudioPrepareRequest["crawlMode"];
}): { scene: string; queryCandidates: string[] } {
  const reactionCandidates = dedupeValues([
    ...buildShortReactionSearchCandidates([params.segmentText, params.slideText, params.contextText]),
    ...toEnglishPlannerCandidates([params.segmentText, ...params.segmentLines, params.slideText, params.contextText]).filter(
      isLikelyReactionQuery
    ),
  ]);
  const visualCandidates = dedupeValues([
    ...toEnglishPlannerCandidates([
      ...buildConcreteVisualSearchCandidates([params.segmentText, params.slideText, params.contextText]),
      params.segmentText,
      ...params.segmentLines,
      params.slideText,
      params.contextText,
    ]).filter((value) => !isLikelyReactionQuery(value)),
  ]);
  const reaction = reactionCandidates[0] || resolveFunHeuristicReaction({
    segment: params.segmentFlags,
    slide: params.slideFlags,
    context: params.contextFlags,
  });
  const visual =
    visualCandidates[0] ||
    (params.segmentFlags.phone || params.contextFlags.phone
      ? "phone text screen"
      : params.segmentFlags.legal || params.slideFlags.legal || params.contextFlags.serious
        ? "paperwork desk"
        : params.segmentFlags.risk || params.contextFlags.risk
          ? "warning sign closeup"
          : "reaction face closeup");
  const alternates = dedupeValues([
    ...visualCandidates.slice(1, 3),
    ...reactionCandidates.slice(1, 3),
    params.segmentFlags.phone || params.contextFlags.phone ? "phone screen closeup" : "",
    params.segmentFlags.legal || params.slideFlags.legal || params.contextFlags.serious ? "office desk scene" : "",
  ]);
  return buildHeuristicQuerySet({
    reaction,
    sceneNoun: visual,
    visual,
    alternates,
    crawlMode: params.crawlMode,
    preferVisualFirst: visualCandidates.length > 0,
  });
}

function buildProfessionalServiceVisualCandidates(values: string[]): string[] {
  const corpus = normalizeWhitespace(values.join(" "));
  if (!corpus) return [];
  const out: string[] = [];
  const add = (...queries: string[]) => {
    pushUniqueValues(out, queries);
  };
  const hasRetirement = matchesAny(corpus, RETIREMENT_PATTERNS);
  const hasAccount = matchesAny(corpus, ACCOUNT_PATTERNS);
  const hasDocument = matchesAny(corpus, DOCUMENT_PATTERNS);
  const hasPayroll = matchesAny(corpus, PAYROLL_PATTERNS);
  const hasTax = matchesAny(corpus, TAX_PATTERNS);
  const hasExit = matchesAny(corpus, EXIT_PATTERNS);
  const hasCash = matchesAny(corpus, CASH_PATTERNS);
  const hasSchedule = matchesAny(corpus, SCHEDULE_PATTERNS);
  const hasStaff = matchesAny(corpus, STAFF_PATTERNS);

  if (hasRetirement && hasSchedule) {
    add("퇴직연금 일정표", "달력 메모", "노트북 일정표");
  }
  if (hasRetirement && hasDocument) {
    add("퇴직연금 가입서류", "퇴직금 정산 서류", "급여 명세서");
  }
  if (hasRetirement && hasPayroll) {
    add("퇴직금 정산 서류", "급여 명세서", "계산기 사진");
  }
  if (hasRetirement && hasAccount) {
    add("퇴직연금 계좌 화면", "연금 통장", "계좌 화면");
  }
  if (hasRetirement && hasExit) {
    add("사직서 사진", "빈 사무실 책상", "직원 서류");
  }
  if (hasTax && hasDocument) {
    add("세금 서류 사진", "증빙 서류", "계산서 사진");
  }
  if (hasTax && hasPayroll) {
    add("세금 계산기", "노트북 회계", "계산기 사진");
  }
  if (hasTax) {
    add("세금 계산기", "세금 서류 사진", "노트북 회계");
  }
  if (hasDocument) {
    add("증빙 서류", "영수증 사진", "계산서 사진");
  }
  if (hasCash) {
    add("지갑 현금", "현금 계산", "통장 사진");
  }
  if (hasStaff && hasExit) {
    add("사직서 사진", "직원 서류", "빈 사무실 책상");
  }
  if (hasStaff && hasPayroll) {
    add("급여 명세서", "직원 서류", "계산기 사진");
  }
  if (hasSchedule && !hasRetirement) {
    add("달력 메모", "노트북 일정표", "서류 정리");
  }

  add(...buildConcreteVisualSearchCandidates(values));

  if (out.length <= 0) {
    add("서류 사진", "노트북 계산기", "사무실 책상");
  }
  return out.slice(0, 6);
}

function buildProfessionalServiceStockSceneBundle(params: {
  segmentText: string;
  slideText: string;
  contextText: string;
}): { scene: string; queryCandidates: string[] } {
  const primaryVisualCandidates = buildProfessionalServiceVisualCandidates([
    params.segmentText,
    params.slideText,
  ]);
  const contextualVisualCandidates =
    primaryVisualCandidates.length >= 3
      ? []
      : buildProfessionalServiceVisualCandidates([params.contextText]).filter(
          (value) => !primaryVisualCandidates.includes(value)
        );
  const visualCandidates = [...primaryVisualCandidates, ...contextualVisualCandidates];
  const queryCandidates = dedupeValues(
    visualCandidates
      .map((value) =>
        sanitizeSearchQueryCandidate(value, {
          mode: "stock",
          allowMemeTerms: false,
          maxTokens: 4,
        })
      )
      .filter(Boolean)
  ).slice(0, 4);
  const primary = queryCandidates[0] || "서류 사진";
  return {
    scene: primary,
    queryCandidates: queryCandidates.length > 0 ? queryCandidates : [primary],
  };
}

function buildHeuristicSceneBundle(params: {
  slide: PlannerSlideRow;
  slides: PlannerSlideRow[];
  slidePosition: number;
  profile: PlannerPromptProfile;
  segmentLines: string[];
  crawlMode?: StudioPrepareRequest["crawlMode"];
  narrativeFlags: HeuristicFlags;
}): { scene: string; queryCandidates: string[] } {
  const segmentText = normalizeWhitespace(params.segmentLines.join(" ")) || params.slide.text || "situation scene";
  const slideText = getPlannerSlideText(params.slide);
  const prevText = params.slides[params.slidePosition - 1] ? getPlannerSlideText(params.slides[params.slidePosition - 1]) : "";
  const nextText = params.slides[params.slidePosition + 1] ? getPlannerSlideText(params.slides[params.slidePosition + 1]) : "";
  const contextText = normalizeWhitespace([segmentText, slideText, prevText, nextText].join(" "));
  const segmentFlags = readHeuristicFlags(segmentText);
  const slideFlags = readHeuristicFlags(slideText);
  const contextFlags = readHeuristicFlags(contextText);
  const hasGlobalReservation = params.narrativeFlags.reservation || params.narrativeFlags.restaurant;

  if (segmentFlags.cta || slideFlags.cta) {
    return buildHeuristicQuerySet({
      reaction: "serious reaction",
      sceneNoun: "paperwork desk",
      visual: "office desk documents",
      alternates: ["paperwork laptop desk", "office meeting table"],
      crawlMode: params.crawlMode,
    });
  }

  if (segmentFlags.repeatPattern || (slideFlags.repeatPattern && segmentFlags.reservation)) {
    return buildHeuristicQuerySet({
      reaction: "skeptical reaction",
      sceneNoun: "booking calendar",
      visual: "multiple booking screen",
      alternates: ["booking calendar screen", "phone booking list"],
      crawlMode: params.crawlMode,
    });
  }

  if (
    segmentFlags.restaurant ||
    (segmentFlags.loss && slideFlags.restaurant) ||
    (segmentFlags.reservation && slideFlags.restaurant)
  ) {
    return buildHeuristicQuerySet({
      reaction: segmentFlags.risk || slideFlags.risk ? "worried reaction" : "frustrated reaction",
      sceneNoun: "empty table",
      visual: "empty restaurant table",
      alternates: ["reserved table sign", "restaurant waiting area"],
      crawlMode: params.crawlMode,
    });
  }

  if (segmentFlags.phone || segmentFlags.reservation || segmentFlags.deception || (segmentFlags.question && hasGlobalReservation)) {
    const suspicious = segmentFlags.deception || segmentFlags.phone;
    return buildHeuristicQuerySet({
      reaction: suspicious ? "suspicious reaction" : segmentFlags.question ? "confused reaction" : "serious reaction",
      sceneNoun: suspicious ? "phone screen" : "booking screen",
      visual: suspicious ? "ignored text screen" : "phone reservation screen",
      alternates: suspicious ? ["phone no answer", "message screen closeup"] : ["booking calendar screen", "phone booking list"],
      crawlMode: params.crawlMode,
    });
  }

  if (segmentFlags.risk || (slideFlags.risk && !segmentFlags.legal)) {
    return buildHeuristicQuerySet({
      reaction: "worried reaction",
      sceneNoun: "warning sign",
      visual: "warning sign closeup",
      alternates: ["red flag warning", "serious office meeting"],
      crawlMode: params.crawlMode,
    });
  }

  if (segmentFlags.legal || slideFlags.legal || contextFlags.serious) {
    return buildHeuristicQuerySet({
      reaction: segmentFlags.question ? "skeptical face" : "serious reaction",
      sceneNoun: "paperwork desk",
      visual: segmentFlags.legal ? "legal paperwork desk" : "case file desk",
      alternates: ["law book desk", "case file desk"],
      crawlMode: params.crawlMode,
    });
  }

  if (slideFlags.reservation || hasGlobalReservation) {
    return buildHeuristicQuerySet({
      reaction: contextFlags.question ? "confused reaction" : "serious reaction",
      sceneNoun: "booking screen",
      visual: "phone reservation screen",
      alternates: ["booking calendar screen", "reserved table sign"],
      crawlMode: params.crawlMode,
    });
  }

  if (params.profile === "professional_service" || params.profile === "knowledge") {
    return buildProfessionalServiceStockSceneBundle({
      segmentText,
      slideText,
      contextText,
    });
  }

  if (params.crawlMode === "fun") {
    return buildFunHeuristicSceneBundle({
      segmentText,
      slideText,
      contextText,
      segmentLines: params.segmentLines,
      segmentFlags,
      slideFlags,
      contextFlags,
      crawlMode: params.crawlMode,
    });
  }

  return buildHeuristicQuerySet({
    reaction: "serious reaction",
    sceneNoun: "work desk",
    visual: "office desk scene",
    alternates: ["daily life scene", "work desk closeup"],
    crawlMode: params.crawlMode,
  });
}

function resolveHeuristicProvider(params: {
  profile: PlannerPromptProfile;
  slide: PlannerSlideRow;
  segmentLines: string[];
}): PlannerProvider {
  const segmentText = normalizeWhitespace(params.segmentLines.join(" "));
  const slideText = getPlannerSlideText(params.slide);
  const segmentFlags = readHeuristicFlags(segmentText);
  const slideFlags = readHeuristicFlags(slideText);
  if (
    params.profile === "politics" ||
    params.profile === "knowledge" ||
    params.profile === "childo_tax" ||
    params.profile === "professional_service" ||
    segmentFlags.legal ||
    slideFlags.legal ||
    segmentFlags.cta ||
    slideFlags.cta
  ) {
    return "naver";
  }
  if (
    params.profile === "story" ||
    segmentFlags.question ||
    segmentFlags.deception ||
    segmentFlags.risk ||
    slideFlags.question ||
    slideFlags.deception
  ) {
    return "giphy";
  }
  return "naver";
}

function findHeuristicSwitchStartLine(slide: PlannerSlideRow): number | undefined {
  if (!Array.isArray(slide.lines) || slide.lines.length < 3) return undefined;
  for (let index = 1; index < slide.lines.length; index += 1) {
    const line = normalizeWhitespace(slide.lines[index] || "");
    if (!line) continue;
    if (matchesAny(line, SWITCH_LINE_PATTERNS)) return index;
  }
  return undefined;
}

export function buildLocalHeuristicPlan(
  slides: PlannerSlideRow[],
  options?: { hint?: string; category?: string; crawlMode?: StudioPrepareRequest["crawlMode"] }
): PlannedImageResponse {
  const profile = resolvePlannerPromptProfile(normalizeWhitespace(options?.category || ""), normalizeWhitespace(options?.hint || ""));
  const narrativeFlags = readHeuristicFlags(slides.map((slide) => getPlannerSlideText(slide)).join(" "));
  return {
    items: slides.map((slide, slidePosition) => {
      const primaryLines = slide.lines.length > 0 ? slide.lines : [slide.text];
      const primaryProvider = resolveHeuristicProvider({
        profile,
        slide,
        segmentLines: primaryLines,
      });
      const primaryBundle = buildHeuristicSceneBundle({
        slide,
        slides,
        slidePosition,
        profile,
        segmentLines: primaryLines,
        crawlMode: primaryProvider === "giphy" ? "fun" : undefined,
        narrativeFlags,
      });
      return {
        slideIndex: slide.slideIndex,
        provider: primaryProvider,
        scene: primaryBundle.scene,
        people: [],
        queryCandidates: primaryBundle.queryCandidates,
      };
    }),
  };
}

function buildPlannerSanitizedCandidates(
  values: string[],
  mode: "auto" | "fun" | "stock",
  options?: { allowMemeTerms?: boolean; maxTokens?: number }
): string[] {
  return dedupeValues(
    values
      .map((value) =>
        sanitizeSearchQueryCandidate(value, {
          mode,
          allowMemeTerms: options?.allowMemeTerms,
          maxTokens: options?.maxTokens,
        })
      )
      .filter((value): value is string => Boolean(value && hasSearchableLetters(value)))
  );
}

function toTrustedFunPlannerCandidates(values: string[]): string[] {
  return dedupeGiphyQueriesByFamily(values, { limit: 6, sanitize: true });
}

function dedupePlannerGiphyFamilies(values: string[]): string[] {
  return dedupeGiphyQueriesByFamily(values, { limit: 6, sanitize: true });
}

function hasDirectVisualQueryAnchor(tokens: string[]): boolean {
  return tokens.some((token) => DIRECT_VISUAL_QUERY_TOKENS.has(token));
}

function hasPersonRoleQueryAnchor(tokens: string[]): boolean {
  return tokens.some((token) => PERSON_ROLE_QUERY_TOKENS.has(token));
}

function toProviderReadyQueryCandidates(values: string[], provider?: ImageProviderId): string[] {
  if (normalizePlannerProvider(provider) !== "naver") {
    return dedupeValues(values.map((value) => normalizeWhitespace(value)).filter(Boolean));
  }
  return dedupeValues(
    values
      .map((value) => {
        const compact = normalizeWhitespace(value);
        return toKoreanNaverQuery(compact) || compact;
      })
      .filter(Boolean)
  );
}

function isWeakStockPlannerCandidate(value: string): boolean {
  const compact = normalizeWhitespace(value);
  if (!compact) return true;
  const signal = analyzeImageRequestSearchSignal(compact);
  const tokens = tokenizeSearchTerms(compact);
  if (tokens.length <= 0 || signal.looksLikeSentence) return true;
  const hasDirectVisualAnchor = hasDirectVisualQueryAnchor(tokens);
  const hasPersonRoleAnchor = hasPersonRoleQueryAnchor(tokens);
  if (!hasDirectVisualAnchor && !hasPersonRoleAnchor) return true;
  const hasAbstractOnlySummaryToken = tokens.some((token) => ABSTRACT_STOCK_QUERY_TOKENS.has(token));
  if (hasAbstractOnlySummaryToken && !hasDirectVisualAnchor) return true;
  return false;
}

function toSearchableQueryCandidates(
  input: string[],
  scene: string,
  slide: SlideInput,
  fallback: ImageRequest,
  crawlMode?: StudioPrepareRequest["crawlMode"],
  provider?: ImageProviderId,
  plannerSource?: ImageRequest["plannerSource"]
): string[] {
  const baseScene = normalizeWhitespace(scene || fallback.scene || "");
  const resolvedProvider = provider || normalizePlannerProvider(fallback.preferredProviders?.[0]);
  if (resolvedProvider === "naver" && plannerSource === "codex") {
    const verbatimCandidates = dedupeValues(input.map((value) => normalizeWhitespace(value)).filter(Boolean));
    if (verbatimCandidates.length > 0) return verbatimCandidates.slice(0, 6);
  }
  const queryMode =
    resolveQueryModeForProvider(resolvedProvider) === "auto" && crawlMode === "fun"
      ? "fun"
      : resolveQueryModeForProvider(resolvedProvider);
  const contextValues = dedupeValues([
    ...input,
    baseScene,
    slide.text,
    ...slide.lines,
    ...(fallback.queryCandidates || []),
    fallback.query || "",
  ]);
  if (queryMode === "fun") {
    const promptCandidates = toTrustedFunPlannerCandidates(input);
    const curatedReactionCandidates = dedupePlannerGiphyFamilies(
      buildGiphyReactionQueriesFromRequest({
        query: input[0] || fallback.query || "",
        queryCandidates: contextValues,
        scene: baseScene,
        people: [],
      })
    );
    const signal = analyzeImageRequestSearchSignal({
      query: input[0] || fallback.query || "",
      queryCandidates: [...input, ...(fallback.queryCandidates || [])],
      scene: baseScene,
    });
    const translatedReactionCandidates = dedupePlannerGiphyFamilies(
      [
        ...buildShortReactionSearchCandidates(contextValues),
        ...buildPlannerSanitizedCandidates(contextValues, "fun", {
          allowMemeTerms: !signal.hasConcreteVisualCue,
          maxTokens: signal.hasConcreteVisualCue ? 4 : 3,
        }),
      ]
        .map((value) => toEnglishHint(value) || value)
    );
    const dedupedFunCandidates = dedupePlannerGiphyFamilies([
      ...promptCandidates,
      ...curatedReactionCandidates,
      ...translatedReactionCandidates,
      ...DEFAULT_GIPHY_FALLBACK_REACTION_QUERIES,
    ]);
    if (dedupedFunCandidates.length > 0) return dedupedFunCandidates.slice(0, 6);
  }
  const strongPlannerInputs = input.filter((value) => !isWeakStockPlannerCandidate(value));
  const concreteContextCandidates = buildPlannerSanitizedCandidates(
    buildConcreteVisualSearchCandidates(contextValues),
    "stock",
    {
      allowMemeTerms: false,
      maxTokens: 4,
    }
  );
  const sanitized = dedupeValues([
    ...buildPlannerSanitizedCandidates(strongPlannerInputs, queryMode === "stock" ? "stock" : "auto", {
      allowMemeTerms: false,
      maxTokens: 4,
    }),
    ...concreteContextCandidates,
    ...buildPlannerSanitizedCandidates(
      contextValues.filter((value) => !isWeakStockPlannerCandidate(value)),
      queryMode === "stock" ? "stock" : "auto",
      {
        allowMemeTerms: false,
        maxTokens: 4,
      }
    ),
  ]);
  const providerReadySanitized = toProviderReadyQueryCandidates(sanitized, resolvedProvider);
  if (providerReadySanitized.length > 0) return providerReadySanitized.slice(0, 6);
  const fallbackVisuals = buildPlannerSanitizedCandidates(
    buildConcreteVisualSearchCandidates([slide.text, ...slide.lines, baseScene]),
    "stock",
    {
      allowMemeTerms: false,
      maxTokens: 4,
    }
  );
  const providerReadyFallbackVisuals = toProviderReadyQueryCandidates(fallbackVisuals, resolvedProvider);
  if (providerReadyFallbackVisuals.length > 0) return providerReadyFallbackVisuals.slice(0, 6);
  const fallbackSanitized = buildPlannerSanitizedCandidates(
    [baseScene, ...(fallback.queryCandidates || []), fallback.query || ""].filter((value) => !isWeakStockPlannerCandidate(value)),
    queryMode === "stock" ? "stock" : "auto",
    {
      allowMemeTerms: false,
      maxTokens: 4,
    }
  );
  const providerReadyFallbackSanitized = toProviderReadyQueryCandidates(fallbackSanitized, resolvedProvider);
  if (providerReadyFallbackSanitized.length > 0) return providerReadyFallbackSanitized.slice(0, 6);
  const sanitizedScene = sanitizeSearchQueryCandidate(baseScene, {
    mode: queryMode === "stock" ? "stock" : "auto",
    allowMemeTerms: false,
    maxTokens: 4,
  });
  const providerReadyScene = toProviderReadyQueryCandidates(sanitizedScene ? [sanitizedScene] : [], resolvedProvider);
  if (providerReadyScene.length > 0) return providerReadyScene;
  const sanitizedFallbackQuery = sanitizeSearchQueryCandidate(fallback.query || "상황", { mode: "auto", maxTokens: 4 });
  const providerReadyFallbackQuery = toProviderReadyQueryCandidates(
    sanitizedFallbackQuery ? [sanitizedFallbackQuery] : [],
    resolvedProvider
  );
  if (providerReadyFallbackQuery.length > 0) return providerReadyFallbackQuery;
  return ["상황"];
}

function toSimpleKeywords(value: string): string[] {
  return normalizeWhitespace(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && /[\p{L}]/u.test(token))
    .slice(0, 6);
}

function resolvePlannerMustAvoid(provider?: ImageProviderId): string[] {
  return normalizePlannerProvider(provider) === "giphy" ? FUN_MODE_MUST_AVOID : DEFAULT_MUST_AVOID;
}

function toFallbackImageRequest(
  slide: SlideInput,
  crawlMode?: StudioPrepareRequest["crawlMode"],
  provider?: ImageProviderId
): ImageRequest {
  const normalizedProvider = normalizePlannerProvider(provider);
  const queryMode =
    resolveQueryModeForProvider(normalizedProvider) === "auto" && crawlMode === "fun"
      ? "fun"
      : resolveQueryModeForProvider(normalizedProvider);
  const sourceText = `${slide.text} ${slide.lines.join(" ")}`;
  const tokens = toSimpleKeywords(sourceText);
  const fallbackMode = queryMode === "fun" ? "fun" : "stock";
  const rawScene =
    buildConcreteVisualSearchCandidates([slide.text, ...slide.lines])[0] ||
    tokens.slice(0, 3).join(" ").trim() ||
    "상황 반응";
  const scene =
    sanitizeSearchQueryCandidate(rawScene, {
      mode: "stock",
      allowMemeTerms: false,
      maxTokens: 4,
    }).slice(0, 24) || "상황 반응";
  const contextCandidates = buildPlannerSanitizedCandidates(
    dedupeValues([slide.title, scene, slide.text, ...slide.lines]),
    fallbackMode,
    {
      allowMemeTerms: fallbackMode === "fun",
      maxTokens: fallbackMode === "fun" ? 3 : 4,
    }
  );
  const fallbackCore =
    contextCandidates[0] ||
    sanitizeSearchQueryCandidate(tokens.slice(0, 4).join(" ").trim() || "상황", {
      mode: fallbackMode,
      allowMemeTerms: fallbackMode === "fun",
      maxTokens: fallbackMode === "fun" ? 3 : 4,
    }) || "상황";
  const shortCandidates = fallbackMode === "fun" ? buildShortReactionSearchCandidates([slide.text, ...slide.lines, scene]) : [];
  const visualCandidates = fallbackMode === "fun" ? buildConcreteVisualSearchCandidates([slide.text, ...slide.lines, scene]) : [];
  const queryCandidates =
    fallbackMode === "fun"
      ? dedupeValues([...shortCandidates, ...visualCandidates, fallbackCore, scene])
      : dedupeValues([
          fallbackCore,
          sanitizeSearchQueryCandidate(scene, { mode: "stock", allowMemeTerms: false, maxTokens: 4 }),
        ]);
  return {
    query: queryCandidates[0] || fallbackCore,
    queryCandidates,
    preferredProviders: toPreferredProviders(normalizedProvider),
    people: [],
    scene,
    orientation: "landscape",
    mustAvoid: resolvePlannerMustAvoid(normalizedProvider),
    plannerSource: "fallback",
  };
}

function sanitizePlannedItem(
  item: PlannedImageItem,
  slide: SlideInput,
  crawlMode?: StudioPrepareRequest["crawlMode"],
  plannerSource: PlannerSourceKind = "codex"
): ImageRequest {
  const provider = normalizePlannerProvider(item.provider) || inferPlannerProviderFromQueries(item.queryCandidates) || "naver";
  const fallback = toFallbackImageRequest(slide, crawlMode, provider);
  const scene = normalizeWhitespace(item.scene || "").slice(0, 24) || fallback.scene || "상황 반응";
  const people = Array.isArray(item.people)
    ? item.people.map((person) => normalizeWhitespace(person)).filter(Boolean).slice(0, 3)
    : [];
  const queryCandidates = toSearchableQueryCandidates(
    Array.isArray(item.queryCandidates) ? item.queryCandidates : [],
    scene,
    slide,
    fallback,
    crawlMode,
    provider,
    plannerSource
  );
  return {
    query: queryCandidates[0],
    queryCandidates,
    preferredProviders: toPreferredProviders(provider),
    people,
    scene,
    orientation: "landscape",
    mustAvoid: resolvePlannerMustAvoid(provider),
    plannerSource,
  };
}

function sanitizePlannedSwitchItem(
  item: PlannedImageItem,
  slide: SlideInput,
  crawlMode?: StudioPrepareRequest["crawlMode"],
  plannerSource: PlannerSourceKind = "codex"
): { startLineIndex: number; imageRequest: ImageRequest; reason?: string } | null {
  const startLineIndex =
    Number.isFinite(item.switchAtLineIndex) && typeof item.switchAtLineIndex === "number"
      ? Math.max(1, Math.floor(item.switchAtLineIndex))
      : NaN;
  const maxStart = Math.max(1, slide.lines.length - 1);
  if (!Number.isFinite(startLineIndex) || startLineIndex > maxStart) return null;
  const provider =
    normalizePlannerProvider(item.switchProvider) ||
    inferPlannerProviderFromQueries(item.switchQueryCandidates || []) ||
    normalizePlannerProvider(item.provider) ||
    inferPlannerProviderFromQueries(item.queryCandidates) ||
    "naver";
  const fallback = toFallbackImageRequest(slide, crawlMode, provider);
  const scene = normalizeWhitespace(item.switchScene || "").slice(0, 24) || fallback.scene || "상황 반응";
  const people = Array.isArray(item.switchPeople)
    ? item.switchPeople.map((person) => normalizeWhitespace(person)).filter(Boolean).slice(0, 3)
    : [];
  const queryCandidates = toSearchableQueryCandidates(
    Array.isArray(item.switchQueryCandidates) ? item.switchQueryCandidates : [],
    scene,
    slide,
    fallback,
    crawlMode,
    provider,
    plannerSource
  );
  return {
    startLineIndex,
    imageRequest: {
      query: queryCandidates[0],
      queryCandidates,
      preferredProviders: toPreferredProviders(provider),
      people,
      scene,
      orientation: "landscape",
      mustAvoid: resolvePlannerMustAvoid(provider),
      plannerSource,
    },
    reason: normalizeWhitespace(item.switchReason || "") || undefined,
  };
}

type PlannerPromptProfile = "politics" | "story" | "knowledge" | "product" | "childo_tax" | "professional_service" | "generic";

const CHILDO_CATEGORY_MATCHERS = ["칠도세무회계", "칠도 세무회계", "childo tax", "childo accounting"];
const CHILDO_FORBIDDEN_QUERY_TERMS = [
  "세무법인",
  "회계법인",
  "세무사무소",
  "삼쩜삼",
  "자비스",
  "회계앱",
  "세무앱",
  "앱추천",
  "어플추천",
  "다운로드",
  "광고",
  "프로모션",
  "이벤트",
];

const PROFESSIONAL_SERVICE_FORBIDDEN_QUERY_TERMS = [
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
  "수수료",
  "이벤트",
  "광고",
  "배너",
  "홍보",
  "프로모션",
  "업체추천",
  "앱추천",
  "다운로드",
];

function resolvePlannerPromptProfile(category?: string, hint?: string): PlannerPromptProfile {
  const corpus = normalizeWhitespace(`${category || ""} ${hint || ""}`).toLowerCase();
  if (CHILDO_CATEGORY_MATCHERS.some((token) => corpus.includes(token.toLowerCase()))) {
    return "childo_tax";
  }
  if (
    corpus.includes("conservative") ||
    corpus.includes("progressive") ||
    corpus.includes("politic") ||
    corpus.includes("정치") ||
    corpus.includes("시사") ||
    corpus.includes("뉴스")
  ) {
    return "politics";
  }
  if (
    corpus.includes("story") ||
    corpus.includes("썰") ||
    corpus.includes("밈") ||
    corpus.includes("meme") ||
    corpus.includes("fun") ||
    corpus.includes("유머")
  ) {
    return "story";
  }
  if (
    corpus.includes("세무") ||
    corpus.includes("회계") ||
    corpus.includes("환급") ||
    corpus.includes("홈택스") ||
    corpus.includes("경정청구") ||
    corpus.includes("법률") ||
    corpus.includes("변호사") ||
    corpus.includes("법무")
  ) {
    return "professional_service";
  }
  if (
    corpus.includes("knowledge") ||
    corpus.includes("지식") ||
    corpus.includes("경제") ||
    corpus.includes("세금") ||
    corpus.includes("finance") ||
    corpus.includes("tax")
  ) {
    return "knowledge";
  }
  if (
    corpus.includes("product") ||
    corpus.includes("it") ||
    corpus.includes("tech") ||
    corpus.includes("ai") ||
    corpus.includes("app") ||
    corpus.includes("tool")
  ) {
    return "product";
  }
  return "generic";
}

function toProfileInstructions(
  profile: PlannerPromptProfile,
  crawlMode?: StudioPrepareRequest["crawlMode"]
): string[] {
  const isFunMode = crawlMode === "fun";
  if (profile === "childo_tax") {
    if (isFunMode) {
      return [
        "[카테고리 지침: 칠도세무회계 전용]",
        "- 다른 세무업체/회계업체/세무·회계 앱으로 보이는 이미지 유도 키워드는 금지한다.",
        `- queryCandidates에 다음 단어를 넣지 않는다: ${CHILDO_FORBIDDEN_QUERY_TERMS.join(", ")}.`,
        "- 세무/회계 맥락은 queryCandidates에 직접 쓰지 말고, 그 상황에서 나올 감정 반응으로 바꾼다.",
        "- `서류`, `홈택스`, `상담`, `사무실`, `책상`, `화면`, `phone text screen`, `paperwork desk`, `office scene` 같은 업무 사물/현장 설명은 fun 모드 1순위 검색어에서 최대한 배제한다.",
        "- giphy 슬롯 좋은 예: `awkward reaction`, `shocked reaction`, `mind blown reaction`, `facepalm reaction`, `side eye reaction`.",
        "- naver 슬롯 좋은 예: `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정`, `어이없음 짤`.",
        "- 나쁜 예: `tax paperwork gif`, `office scene`, `consulting photo`, `hometax screen`, `phone text screen`.",
      ];
    }
    return [
      "[카테고리 지침: 칠도세무회계 전용]",
      "- 다른 세무업체/회계업체/세무·회계 앱으로 보이는 이미지 유도 키워드는 금지한다.",
      `- queryCandidates에 다음 단어를 넣지 않는다: ${CHILDO_FORBIDDEN_QUERY_TERMS.join(", ")}.`,
      "- 광고/홍보/앱 설치 유도 문구(예: 추천, 다운로드, 이벤트) 금지.",
      "- 신고·환급·서류·홈택스·상담 같은 업무 상황/반응 중심의 일반 키워드를 우선한다.",
      "- queryCandidates는 3개를 권장하고, 서로 다른 상황 묘사로 작성한다.",
    ];
  }
  if (profile === "politics") {
    return [
      "[카테고리 지침: 정치/시사]",
      "- 인물/기관/이슈 맥락이 보이는 검색어를 우선한다.",
      "- queryCandidates는 3개를 권장하며, 최소 2개는 사실 맥락(브리핑/국회/기자회견 등) 중심으로 작성한다.",
      "- '짤/밈/움짤/gif' 키워드는 사용하지 않는다.",
    ];
  }
  if (profile === "story") {
    return [
      "[카테고리 지침: 썰/밈/리액션]",
      "- 사실재현보다 상황+감정 전달을 우선한다.",
      "- queryCandidates는 3개를 권장한다. giphy 슬롯은 영어 reaction phrase, naver 슬롯은 한국어 짤/표정 검색어로 작성한다.",
      "- giphy 슬롯은 최소 1개 이상 `reaction` 또는 `meme` 계열 표현을 넣고, naver 슬롯은 `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정`처럼 짧은 한국어 반응 검색어를 우선한다.",
      "- 실명/기관명/연도 중심의 보도형 키워드는 피한다.",
      "- queryCandidates는 길게 설명하지 말고, 2~4단어 수준의 짧은 반응형 검색어를 우선한다.",
      "- 놀라는 상황이면 giphy 슬롯은 `shocked reaction`, naver 슬롯은 `놀란 표정`처럼 provider 언어에 맞는 짧은 표현을 우선한다.",
      "- 직업/업종/서비스명 같은 맥락 명사는 queryCandidates에 길게 쓰지 말고, 감정/태도 중심 단어로 바꾼다.",
      "- '방 불 켜짐', '누가 있었음', '이상한 느낌'처럼 서사를 요약한 추상 문장을 쓰지 말고, 실제로 보이는 장면 단위로 바꾼다.",
      "- 예: '방 불 켜짐' 대신 '불 켜진 방문', '어두운 복도 문틈 불빛', '방 안 불빛'처럼 시각적으로 찾기 쉬운 명사형 검색어를 쓴다.",
      "- queryCandidates에는 썰 제목, 문장형 설명, 감상문, 수식어 남발을 넣지 않는다.",
      "- 예: '작고 귀여운 귀신썰', '누군가 있는 것 같은 느낌', '뭔가 이상한 장면' 같은 표현은 금지한다.",
      "- queryCandidates는 실제 검색창에 넣었을 때 결과가 많이 나올 짧은 표현만 사용한다. 표정, 반응, 실루엣, 그림자, 문틈, 불빛, 복도 같은 검색 강한 명사를 우선한다.",
    ];
  }
  if (profile === "knowledge") {
    return [
      "[카테고리 지침: 지식/설명/세금]",
      "- 주제 앵커(예: 세금/환급/신고/서류)는 유지하되, 현장 반응형 키워드를 함께 넣는다.",
      "- queryCandidates는 3개를 권장하며, 문서/표/그래프 유도 키워드는 피한다.",
      "- literal 번역보다 검색 강한 한국어 명사를 우선한다. 예: `세금 신고 서류`보다 `서류`.",
      "- 너무 추상적인 단어만 단독으로 쓰지 않는다.",
      "- 특정 업체/사무소/앱/서비스 홍보처럼 보이는 검색어는 피한다.",
    ];
  }
  if (profile === "professional_service") {
    if (isFunMode) {
      return [
        "[카테고리 지침: 세무/회계/법률/상담 서비스]",
        "- 다른 업체나 사무소를 홍보하는 이미지가 나오지 않게 쿼리를 작성한다.",
        `- queryCandidates에 다음 단어를 넣지 않는다: ${PROFESSIONAL_SERVICE_FORBIDDEN_QUERY_TERMS.join(", ")}.`,
        "- 서비스/업무 맥락은 queryCandidates에 직접 쓰지 말고, 그 장면에서 느껴질 반응 검색어로 바꾼다.",
        "- `office`, `desk`, `paperwork`, `document`, `screen`, `consulting`, `photo`, `scene` 같은 현장사진형 영어 명사는 giphy 슬롯 1순위 검색어에서 금지한다.",
        "- giphy 슬롯 좋은 예: `worried reaction`, `confused reaction`, `suspicious reaction`, `blank stare reaction`, `nervous laugh`.",
        "- naver 슬롯 좋은 예: `걱정 짤`, `당황 짤`, `정색 짤`, `수상한 표정`, `놀란 표정`.",
        "- 나쁜 예: `law office scene`, `tax paperwork gif`, `consulting desk`, `document photo`, `screen capture reaction`.",
      ];
    }
    return [
      "[카테고리 지침: 세무/회계/법률/상담 서비스]",
      "- 다른 업체나 사무소를 홍보하는 이미지가 나오지 않게 쿼리를 작성한다.",
      `- queryCandidates에 다음 단어를 넣지 않는다: ${PROFESSIONAL_SERVICE_FORBIDDEN_QUERY_TERMS.join(", ")}.`,
      "- 특정 회사명, 사무소명, 브랜드명, 앱명, 간판명, 광고문구를 넣지 않는다.",
      "- 전화번호, 상담문의, 가격표, 무료상담, 이벤트 배너가 보일 것 같은 검색어를 금지한다.",
      "- 사무실 전경, 간판, 홍보 포스터, 앱 홍보 화면보다 서류 검토, 컴퓨터 작업, 홈택스 화면, 일반 상담 장면 같은 중립적 상황을 우선한다.",
      "- queryCandidates는 3개를 권장하며, 업무 상황/반응 중심의 일반 키워드로 서로 다르게 작성한다.",
      "- `세금 신고 서류 사진`처럼 길게 풀어 쓰지 말고 `서류`, `통장`, `급여 명세서`, `예약 화면`, `책상`처럼 짧은 한국어 명사형을 우선한다.",
    ];
  }
  if (profile === "product") {
    return [
      "[카테고리 지침: IT/제품/앱]",
      "- 제품/서비스 화면, 사용 상황, 기능 맥락이 드러나는 검색어를 우선한다.",
      "- queryCandidates는 3개를 권장하며, 최소 1개는 화면/사용 장면 중심 키워드로 작성한다.",
      "- 무관한 유머 밈 키워드는 피한다.",
    ];
  }
  return [
    "[카테고리 지침: 일반]",
    "- 슬라이드 텍스트의 상황 흐름이 드러나는 검색어를 우선한다.",
    "- queryCandidates는 3개를 권장하며, 중복 어휘는 줄인다.",
    "- 서사 요약형 표현보다 실제로 화면에 보이는 사물, 공간, 인물, 조명 상태를 우선한다.",
    "- literal 번역이나 제목형 문장보다 실제 검색이 잘 되는 짧은 한국어 명사를 우선한다.",
    "- queryCandidates는 검색 엔진에 실제로 많이 존재할 짧은 표현으로 작성한다. 제목형 문장, 감상형 문장, 썰 이름은 금지한다.",
  ];
}

function toCrawlModeInstructions(crawlMode?: StudioPrepareRequest["crawlMode"]): string[] {
  if (crawlMode === "fun") {
    return [
      "[이미지 분위기: 재밌는 모드]",
      "- 슬라이드 title은 훅 문구일 수 있으므로 queryCandidates를 만들 때 검색 소스로 쓰지 않는다. text와 lines만 본다.",
      "- 상황 전달보다 리액션, 밈, 짤, 감정 과장이 느껴지는 검색어를 우선한다. 정적인 stock 사진만 강제하지 않는다.",
      "- queryCandidates는 가능하면 정확히 3개 작성한다. provider가 giphy면 모두 영어, provider가 naver면 모두 한국어로 쓴다.",
      "- giphy 1번 후보는 `<emotion> reaction`, 2번 후보는 `<emotion> meme` 또는 다른 reaction 변형, 3번 후보는 `side eye reaction`, `nervous laugh`, `blank stare reaction`, `mind blown reaction`, `facepalm reaction` 같은 짧은 표정/태도 표현으로 만든다.",
      "- naver 1번 후보는 `당황 짤`, `황당 짤`, `어이없음 짤`, `정색 짤`, `놀란 표정`, `수상한 표정` 같은 짧은 한국어 짤/표정 검색어를 우선한다. concrete visual query는 3순위 fallback으로만 허용한다.",
      "- 허용되는 giphy 검색어 형태는 `awkward reaction`, `shocked reaction`, `wtf reaction`, `confused reaction`, `suspicious reaction`, `mind blown reaction`, `side eye reaction`, `nervous laugh`, `blank stare reaction`, `facepalm reaction`처럼 GIPHY에서 많이 나오는 reaction phrase 위주다.",
      "- `gif`, `giphy`, `photo`, `picture`, `image`, `scene` 같은 검색엔진 접미사/설명어는 붙이지 않는다.",
      "- `office`, `desk`, `paperwork`, `document`, `screen`, `close up`, `consulting`, `hometax`, `tax`, `accounting`, `lawyer` 같은 업무/사물/직업 단어도 queryCandidates에서 최대한 배제한다.",
      "- provider별 검색 기준으로 queryCandidates는 짧고 직접적으로 작성한다. giphy는 2~4단어 영어 reaction phrase, naver는 1~3개 핵심 한국어 짤/표정 검색어를 우선한다.",
      "- 'self employed person awkward reaction gif' 같은 긴 설명형 검색어보다 `confident reaction`, `awkward smile`, `wtf reaction`, `side eye reaction` 또는 `당황 짤`, `정색 짤`, `놀란 표정`처럼 감정/반응 중심 검색어를 우선한다.",
      "- 업종/직업/서비스명(예: 자영업자, 세무, 홈택스)은 queryCandidates에 넣지 말고, 그 문맥에서 느껴지는 감정만 남긴다.",
      "- `paperwork desk`, `office scene`, `phone text screen` 같은 현장사진/사물 설명형 표현보다 표정·태도·반응 검색어를 우선한다. 네이버도 예외가 아니다.",
      "- 최종 self-check: giphy 후보에 `gif/giphy/photo/scene/desk/screen/paperwork/tax`가 남아 있으면 버리고 영어 reaction phrase로 다시 쓴다. naver 후보에 영어가 남아 있으면 버리고 한국어 짤/표정 검색어로 다시 쓴다.",
      "- 썰 제목이나 캐릭터 수식어를 queryCandidates에 넣지 않는다. 긴 문장, 감상문은 금지한다.",
    ];
  }
  return [
    "[이미지 분위기: 검색 친화형 모드]",
    "- queryCandidates는 네이버 이미지 검색에 잘 걸리는 짧은 한국어 검색어로 작성한다.",
    "- 영어 literal 번역을 그대로 쓰지 않는다. 예: `tax filing documents`류는 `서류`, `bank account book`류는 `통장`, `accounting office work`류는 `책상`처럼 줄인다.",
    "- queryCandidates는 설명문이 아니라 1~3개 핵심 명사 중심의 짧은 표현으로 작성한다.",
    "- queryCandidates는 실제 검색 결과가 많이 나오는 사물/장면 위주로 단순화한다.",
    "- queryCandidates에 영어, 제목형 문장, 감상문, 광고 문구를 넣지 않는다.",
  ];
}

function shouldSuppressTitleInPrompt(
  profile: PlannerPromptProfile,
  crawlMode?: StudioPrepareRequest["crawlMode"]
): boolean {
  return crawlMode === "fun" || profile === "story";
}

function toPrompt(
  slides: Array<{ slideIndex: number; title: string; text: string; lines: string[] }>,
  options?: PlannerPromptOptions
): string {
  const plannerHint = normalizeWhitespace(options?.hint || "");
  const profile = resolvePlannerPromptProfile(normalizeWhitespace(options?.category || ""), plannerHint);
  const suppressTitle = shouldSuppressTitleInPrompt(profile, options?.crawlMode);
  const slideRows = slides
    .map((slide) => {
      const linesRow = slide.lines.map((line, index) => `[${index}] ${line}`).join(" / ");
      const titleRow = !suppressTitle && normalizeWhitespace(slide.title) ? `title=${slide.title}\n` : "";
      return `slideIndex=${slide.slideIndex}\n${titleRow}text=${slide.text}\nlines=${linesRow}`;
    })
    .join("\n\n");
  const hintLine = plannerHint ? `추가 가이드: ${plannerHint}` : "";
  return [
    "너는 숏폼 영상 이미지 검색 플래너다.",
    "입력 슬라이드 대본을 읽고 각 slideIndex마다 어떤 provider에서 어떤 query로 이미지를 찾는 게 가장 맞는지 정한다.",
    "provider는 반드시 `naver` 또는 `giphy` 중 하나만 쓴다.",
    "provider는 슬라이드의 내용으로 결정한다. slide index parity나 고정된 alternating 규칙으로 provider를 정하지 않는다.",
    "실제 장면, 사물, 문서, 화면, 장소, 기사/브리핑 사진이 맞으면 `naver`를 고른다.",
    "감정, 리액션, 표정, 태도, 밈 전달이 더 중요하면 `giphy`를 고른다.",
    "naver는 짧은 한국어 queryCandidates를 쓴다. 실제 사진/장면 검색도 가능하고, fun/meme 맥락이면 `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정` 같은 한국어 반응 검색어도 허용한다.",
    "giphy는 짧은 영어 reaction phrase queryCandidates를 쓴다.",
    "각 슬라이드마다 provider와 queryCandidates를 정하고, 슬라이드마다 이미지는 반드시 한 장만 쓴다.",
    "반드시 JSON 객체 하나만 반환한다.",
    "반환 스키마:",
    '{"items":[{"slideIndex":0,"provider":"naver","queryCandidates":["후보1","후보2","후보3"]}]}',
    "규칙:",
    "- items 길이는 입력 슬라이드 개수와 같아야 한다.",
    "- slideIndex는 입력에 적힌 숫자를 그대로 복사한다. batch 안에서 0부터 다시 매기지 않는다.",
    "- provider는 slide마다 1개만 고른다.",
    "- 슬라이드 내부에서 이미지를 바꾸지 않는다. switchAtLineIndex, switchProvider, switchQueryCandidates는 작성하지 않는다.",
    "- queryCandidates는 1개 이상 작성하고, 첫 후보가 실제 검색에 가장 적합한 검색어여야 한다.",
    "- provider가 `naver`면 queryCandidates는 실제 네이버 이미지 검색창에 넣을 짧은 한국어 검색어만 쓴다. 정적인 stock만 강제하지 말고, 리액션이 맞으면 한국어 짤/표정 검색어를 써도 된다.",
    "- provider가 `giphy`면 queryCandidates는 실제 GIPHY 검색창에 넣을 짧은 영어 검색어만 쓴다.",
    "- provider 선택은 슬라이드 의미를 우선한다. 같은 요청 안에서 slide 1,2,3... 순서만으로 giphy/naver를 번갈아 강제하지 않는다.",
    "- giphy는 영어 reaction phrase로 맞춰서 해결하고, naver는 한국어 짤/표정 검색어와 concrete visual query 중 실제 검색 강도가 더 높은 쪽으로 맞춰서 해결한다.",
    "- `giphy`, `gif`, `photo`, `picture`, `image` 같은 접미사는 queryCandidates에 쓰지 않는다.",
    "- 긴 문장, 설명문, 감상문, 마크다운, URL, 한국어+영어 혼합 검색어는 금지한다.",
    "- 숫자나 금액을 그대로 쓰지 말고, 장면이나 반응으로 바꿔 쓴다.",
    "- `직원 갑작 퇴사`, `한번에 돈 마련`, `미리 준비`, `퇴직금 별도적립`, `법인세 절세`처럼 추상 요약/행동 설명만 있는 queryCandidates는 금지한다.",
    "- 네이버 queryCandidates는 static stock-only가 아니다. 리액션이 맞는 슬라이드는 `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정`, `어이없음 짤` 같은 한국어 밈/표정 검색어를 써도 된다.",
    "- 좋은 네이버 예: `당황 짤`, `황당 짤`, `정색 짤`, `놀란 표정`, `서류`, `통장`, `급여 명세서`, `예약 화면`, `책상`, `식당 테이블`.",
    "- 나쁜 네이버 예: `세무 비용 처리`, `직원 퇴직`, `한번에 돈 마련`, `미리 준비`, `rich reaction`.",
    "- GIPHY queryCandidates는 `awkward reaction`, `shocked reaction`, `side eye reaction`, `facepalm reaction`, `mind blown reaction`, `blank stare reaction`, `nervous laugh`처럼 완성형 reaction phrase로 작성한다.",
    "- `serious`, `funny`, `happy`, `worried`처럼 단독 형용사 1단어만 있는 GIPHY queryCandidates는 금지한다.",
    "- 한 요청 안에서 같은 reaction family를 남발하지 않는다. 예: `awkward reaction`, `cringe reaction`, `nervous laugh`는 같은 awkward 계열이므로 한 슬라이드 안에 동시에 많이 넣지 않는다.",
    "- 연속 슬라이드에서 같은 reaction family를 반복하지 말고, 내용이 비슷해도 다른 family 후보를 섞는다.",
    "- URL/마크다운/설명문 금지.",
    "",
    ...toProfileInstructions(profile, options?.crawlMode),
    "",
    ...toCrawlModeInstructions(options?.crawlMode),
    hintLine,
    "",
    "[입력 슬라이드]",
    slideRows,
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJsonObjectText(raw: string): string {
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return stripped;
  }
  return stripped.slice(first, last + 1);
}

function normalizePlannedItems(itemsRaw: unknown): PlannedImageResponse {
  const itemsSource = Array.isArray(itemsRaw) ? itemsRaw : [];
  const items = itemsSource
    .map((item): PlannedImageItem | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const slideIndexRaw = Number(row.slideIndex);
      if (!Number.isFinite(slideIndexRaw)) return null;
      const provider = normalizePlannerProvider(row.provider);
      const scene = typeof row.scene === "string" ? row.scene : "";
      const people = Array.isArray(row.people) ? row.people.map((value) => String(value || "")) : [];
      const queryCandidates = Array.isArray(row.queryCandidates) ? row.queryCandidates.map((value) => String(value || "")) : [];
      const switchAtLineIndexRaw = Number(row.switchAtLineIndex);
      const switchProvider = normalizePlannerProvider(row.switchProvider);
      const switchScene = typeof row.switchScene === "string" ? row.switchScene : "";
      const switchPeople = Array.isArray(row.switchPeople) ? row.switchPeople.map((value) => String(value || "")) : [];
      const switchQueryCandidates = Array.isArray(row.switchQueryCandidates)
        ? row.switchQueryCandidates.map((value) => String(value || ""))
        : [];
      return {
        slideIndex: Math.max(0, Math.floor(slideIndexRaw)),
        provider,
        scene,
        people,
        queryCandidates,
        switchAtLineIndex: Number.isFinite(switchAtLineIndexRaw) ? Math.max(1, Math.floor(switchAtLineIndexRaw)) : undefined,
        switchProvider,
        switchScene,
        switchPeople,
        switchQueryCandidates,
        switchReason: typeof row.switchReason === "string" ? row.switchReason : "",
      };
    })
    .filter((item): item is PlannedImageItem => Boolean(item));
  return { items };
}

function stripTrailingJsonCommas(raw: string): string {
  return raw.replace(/,\s*([}\]])/g, "$1");
}

function extractJsonStringValue(raw: string, propertyName: string): string {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "s");
  const match = raw.match(pattern);
  if (!match?.[1]) return "";
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return "";
  }
}

function extractJsonIntegerValue(raw: string, propertyName: string): number | undefined {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*(-?\\d+)`, "s");
  const match = raw.match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractJsonStringList(raw: string, propertyName: string): string[] {
  const pattern = new RegExp(`"${propertyName}"\\s*:\\s*\\[(?<content>[\\s\\S]*?)\\]`, "s");
  const match = raw.match(pattern);
  const content = typeof match?.groups?.content === "string" ? match.groups.content : "";
  if (!content) return [];
  return Array.from(content.matchAll(/"(?:[^"\\]|\\.)*"/g))
    .map((entry) => {
      try {
        return JSON.parse(entry[0]) as string;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function extractItemsArrayContent(raw: string): string {
  const itemsStart = raw.search(/"items"\s*:\s*\[/);
  if (itemsStart === -1) return "";
  const bracketStart = raw.indexOf("[", itemsStart);
  if (bracketStart === -1) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = bracketStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(bracketStart + 1, index);
      }
    }
  }
  return "";
}

function extractTopLevelObjectFragments(raw: string): string[] {
  const fragments: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (depth <= 0 && char !== "{") continue;
    current += char;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && current.trim()) {
        fragments.push(current.trim());
        current = "";
      }
    }
  }

  return fragments;
}

function parseLoosePlannedItem(raw: string): PlannedImageItem | null {
  const strictParsed = (() => {
    try {
      return JSON.parse(stripTrailingJsonCommas(raw)) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (strictParsed) {
    return normalizePlannedItems([strictParsed]).items[0] || null;
  }

  const slideIndexRaw = extractJsonIntegerValue(raw, "slideIndex");
  if (!Number.isFinite(slideIndexRaw)) return null;
  const slideIndex = Number(slideIndexRaw);
  const provider = normalizePlannerProvider(extractJsonStringValue(raw, "provider"));
  return {
    slideIndex: Math.max(0, Math.floor(slideIndex)),
    provider,
    scene: extractJsonStringValue(raw, "scene"),
    people: extractJsonStringList(raw, "people"),
    queryCandidates: extractJsonStringList(raw, "queryCandidates"),
    switchAtLineIndex: extractJsonIntegerValue(raw, "switchAtLineIndex"),
    switchProvider: normalizePlannerProvider(extractJsonStringValue(raw, "switchProvider")),
    switchScene: extractJsonStringValue(raw, "switchScene"),
    switchPeople: extractJsonStringList(raw, "switchPeople"),
    switchQueryCandidates: extractJsonStringList(raw, "switchQueryCandidates"),
    switchReason: extractJsonStringValue(raw, "switchReason"),
  };
}

function parsePlannedResponseLoosely(raw: string): PlannedImageResponse | null {
  const itemsContent = extractItemsArrayContent(raw);
  if (!itemsContent) return null;
  const fragments = extractTopLevelObjectFragments(itemsContent);
  if (fragments.length <= 0) return null;
  const items = fragments
    .map((fragment) => parseLoosePlannedItem(fragment))
    .filter((item): item is PlannedImageItem => Boolean(item));
  return items.length > 0 ? { items } : null;
}

function parsePlannedResponse(raw: string): PlannedImageResponse {
  const jsonText = extractJsonObjectText(raw);
  const strictCandidates = Array.from(new Set([jsonText, stripTrailingJsonCommas(jsonText)]));
  let lastError: unknown = null;

  for (const candidate of strictCandidates) {
    try {
      const parsed = JSON.parse(candidate) as { items?: unknown };
      return normalizePlannedItems(parsed.items);
    } catch (error) {
      lastError = error;
    }
  }

  const looseParsed = parsePlannedResponseLoosely(jsonText);
  if (looseParsed) return looseParsed;
  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Failed to parse planned image response."));
}

async function planByCodexCli(
  slides: Array<{ slideIndex: number; title: string; text: string; lines: string[] }>,
  options?: PlannerPromptOptions
): Promise<PlannedImageResponse> {
  const prompt = toPrompt(slides, options);
  const text = await runLocalCodexCliPrompt(prompt, {
    outputPrefix: "codex-image-query-plan",
    timeoutMs: resolvePlannerTimeoutMs(),
    maxBufferBytes: 1024 * 1024 * 8,
    model: options?.codexModel,
    configOverrides: IMAGE_PLANNER_FAST_CONFIG_OVERRIDES,
    outputSchema: IMAGE_PLANNER_RESPONSE_SCHEMA,
  });
  if (!text) {
    throw new Error("Codex CLI planner returned empty content");
  }
  return parsePlannedResponse(text);
}

/**
 * API transport (OpenAI or DeepSeek, via requestCodexChatCompletion) for
 * environments without the local Codex CLI bridge. Without this, DeepSeek
 * deployments always fell through to the heuristic image planner below,
 * since planByCodexCli has no API equivalent.
 */
async function planByCodexApi(
  slides: Array<{ slideIndex: number; title: string; text: string; lines: string[] }>,
  codexAccessToken: string,
  options?: PlannerPromptOptions
): Promise<PlannedImageResponse> {
  const prompt = toPrompt(slides, options);
  const completion = await requestCodexChatCompletion({
    accessToken: codexAccessToken,
    messages: [
      { role: "system", content: "Return JSON only, matching the requested schema exactly." },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    model: options?.codexModel || getCodexModel(),
  });
  if (!completion.text) {
    throw new Error("Codex API planner returned empty content");
  }
  return parsePlannedResponse(completion.text);
}

export async function planMissingSlideImageRequests(
  payload: StudioPrepareRequest,
  options?: { codexAccessToken?: string; transportOverrides?: ImagePlannerTransportOverrides; batchSize?: number; bestEffort?: boolean }
): Promise<PlanResult> {
  const warnings: string[] = [];
  const normalizedSlides = payload.slides.map((slide) => collapseSlideToSingleImage(slide));
  const debugImageSearch = Boolean(payload.debugImageSearch);
  const debugSelectionPolicy = debugImageSearch || process.env.NODE_ENV !== "production";
  const missingSlides = normalizedSlides
    .map((slide, slideIndex) => ({ slide, slideIndex }))
    .filter(({ slide }) => !slide.imageRequest || !normalizeWhitespace(slide.imageRequest.query || ""));

  const codexAccessToken = (options?.codexAccessToken || "").trim();
  const requestSlides: PlannerSlideRow[] = missingSlides.map(({ slide, slideIndex }) => ({
    slideIndex,
    title: normalizeWhitespace(slide.title),
    text: normalizeWhitespace(slide.text),
    lines: slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean),
  }));

  const requestSlideIndexes = new Set(requestSlides.map((slide) => slide.slideIndex));
  const planMap = new Map<number, PlannedImageItem>();
  const planSourceMap = new Map<number, PlannerSourceKind>();
  const plannerFailureMessages: string[] = [];
  const recordPlannerFailure = (message: string) => {
    warnings.push(message);
    plannerFailureMessages.push(message);
  };
  const applyPlannedItems = (planned: PlannedImageResponse, plannerSource: PlannerSourceKind = "codex") => {
    for (const item of planned.items) {
      if (!requestSlideIndexes.has(item.slideIndex)) continue;
      planMap.set(item.slideIndex, item);
      planSourceMap.set(item.slideIndex, plannerSource);
    }
  };
  const applyHeuristicFallbackForSlides = (slidesToPlan: PlannerSlideRow[], reason: string) => {
    if (slidesToPlan.length <= 0) return;
    const heuristicPlan = buildLocalHeuristicPlan(slidesToPlan, {
      hint: payload.imagePlannerHint,
      category: payload.publishCategory,
      crawlMode: payload.crawlMode,
    });
    applyPlannedItems(heuristicPlan, "heuristic");
    warnings.push(
      `[planner] ${reason} Using local heuristic plan for slides ${slidesToPlan.map((slide) => slide.slideIndex).join(", ")}.`
    );
  };
  const transportOverrides = options?.transportOverrides;
  const useLocalCli =
    requestSlides.length > 0
      ? transportOverrides?.canUseLocalCliBridge
        ? transportOverrides.canUseLocalCliBridge(codexAccessToken)
        : canUseLocalCodexCliBridge(codexAccessToken)
      : false;
  const useApi = !useLocalCli && requestSlides.length > 0 && Boolean(codexAccessToken);
  const plannerOptions: PlannerPromptOptions = {
    hint: payload.imagePlannerHint,
    category: payload.publishCategory,
    crawlMode: payload.crawlMode,
    codexModel: useLocalCli ? resolveImagePlannerCliModel() : getCodexModel(),
  };
  const planWithCli = transportOverrides?.planByCodexCli || planByCodexCli;
  const planWithApi = transportOverrides?.planByCodexApi || planByCodexApi;
  const plannerAvailable = useLocalCli || useApi;
  const plannerBatches = chunkItems(requestSlides, resolvePlannerBatchSize(options?.batchSize));
  const partialRetryAttempts = resolvePlannerPartialRetryAttempts();
  const toBatchLabel = (batchIndex: number) =>
    plannerBatches.length > 1 ? ` batch ${batchIndex + 1}/${plannerBatches.length}` : "";
  const planSingleBatch = async (batch: PlannerSlideRow[], batchIndex: number): Promise<PlannedImageResponse> => {
    try {
      return await runCodexPlannerWithRetry(
        () => (useLocalCli ? planWithCli(batch, plannerOptions) : planWithApi(batch, codexAccessToken, plannerOptions)),
        IMAGE_PLANNER_RETRY_OPTIONS
      );
    } catch (error) {
      throw new Error(
        `[planner] Codex ${useLocalCli ? "CLI" : "API"} plan failed${toBatchLabel(batchIndex)}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  if (plannerBatches.length > 0 && plannerAvailable) {
    for (const [batchIndex, batch] of plannerBatches.entries()) {
      let pendingSlides = batch;
      for (let partialAttempt = 1; partialAttempt <= partialRetryAttempts; partialAttempt += 1) {
        try {
          const planned = await planSingleBatch(pendingSlides, batchIndex);
          const normalized = normalizeBatchPlannedResponse(planned, pendingSlides);
          if (normalized.remappedRawSlideIndexes.length > 0) {
            warnings.push(
              `[planner] Codex plan remapped local slideIndex${toBatchLabel(batchIndex)}: raw [${normalized.rawSlideIndexes.join(", ")}] -> resolved [${normalized.items
                .map((item) => item.slideIndex)
                .join(", ")}]`
            );
          }
          applyPlannedItems({ items: normalized.items });
          const unresolvedPendingSlides = pendingSlides.filter(
            (slide) => !normalized.items.some((item) => item.slideIndex === slide.slideIndex)
          );
          if (unresolvedPendingSlides.length <= 0) break;

          const partialMessage =
            `[planner] Codex plan partial${toBatchLabel(batchIndex)} attempt ${partialAttempt}/${partialRetryAttempts}: expected [` +
            `${pendingSlides.map((slide) => slide.slideIndex).join(", ")}], received [` +
            `${normalized.items.map((item) => item.slideIndex).join(", ") || "none"}]` +
            `${normalized.rawSlideIndexes.length > 0 ? `, raw [${normalized.rawSlideIndexes.join(", ")}]` : ""}`;
          if (partialAttempt >= partialRetryAttempts) {
            recordPlannerFailure(`${partialMessage}; still missing [${unresolvedPendingSlides.map((slide) => slide.slideIndex).join(", ")}]`);
            break;
          }
          warnings.push(`${partialMessage}; retrying missing [${unresolvedPendingSlides.map((slide) => slide.slideIndex).join(", ")}]`);
          pendingSlides = unresolvedPendingSlides;
        } catch (error) {
          recordPlannerFailure(error instanceof Error ? error.message : String(error));
          break;
        }
      }
    }
  } else if (requestSlides.length > 0) {
    const unavailableMessage =
      "[planner] Codex image planner is unavailable because neither the local Codex CLI bridge nor an API access token is available, and heuristic fallback is disabled.";
    if (!options?.bestEffort) {
      throw new Error(unavailableMessage);
    }
    recordPlannerFailure(unavailableMessage);
    applyHeuristicFallbackForSlides(requestSlides, "Codex image planner is unavailable.");
  }

  let unresolvedSlideIndexes = requestSlides
    .map((slide) => slide.slideIndex)
    .filter((slideIndex) => !planMap.has(slideIndex));
  if (unresolvedSlideIndexes.length > 0) {
    const resolvedCount = requestSlides.length - unresolvedSlideIndexes.length;
    const plannerFailureSummary =
      plannerFailureMessages.length > 0 ? ` Failures: ${plannerFailureMessages.join(" | ")}` : "";
    if (!options?.bestEffort) {
      throw new Error(
        `[planner] Codex image planner did not return plans for slides ${unresolvedSlideIndexes.join(", ")}. Resolved ${resolvedCount}/${requestSlides.length}. Heuristic fallback is disabled.${plannerFailureSummary}`
      );
    }
    const unresolvedSlideIndexSet = new Set(unresolvedSlideIndexes);
    applyHeuristicFallbackForSlides(
      requestSlides.filter((slide) => unresolvedSlideIndexSet.has(slide.slideIndex)),
      `[planner] Codex image planner returned partial coverage (${resolvedCount}/${requestSlides.length}).${plannerFailureSummary}`.trim()
    );
    unresolvedSlideIndexes = requestSlides
      .map((slide) => slide.slideIndex)
      .filter((slideIndex) => !planMap.has(slideIndex));
    if (unresolvedSlideIndexes.length > 0) {
      throw new Error(
        `[planner] Heuristic fallback did not return plans for slides ${unresolvedSlideIndexes.join(", ")} after partial Codex failure.`
      );
    }
  }

  const slides = normalizedSlides.map((slide, slideIndex) => {
    if (slide.imageRequest && normalizeWhitespace(slide.imageRequest.query || "")) return slide;
    const planned = planMap.get(slideIndex);
    if (!planned) {
      throw new Error(`[planner] Missing Codex image plan for slide ${slideIndex}. Heuristic fallback is disabled.`);
    }

    const plannerSource = planSourceMap.get(slideIndex) || "codex";
    const primaryRequest = sanitizePlannedItem(planned, slide, payload.crawlMode, plannerSource);
    const switchItem = sanitizePlannedSwitchItem(planned, slide, payload.crawlMode, plannerSource);
    if (debugImageSearch) {
      warnings.push(
        `[debug] planner slide[${slideIndex}] source=${plannerSource} scene="${primaryRequest.scene || ""}" queries=${(primaryRequest.queryCandidates || []).join(" | ")}`
      );
      if (switchItem) {
        warnings.push(
          `[debug] planner slide[${slideIndex}] ignored-switch line=${switchItem.startLineIndex} scene="${switchItem.imageRequest.scene || ""}" queries=${(switchItem.imageRequest.queryCandidates || []).join(" | ")}`
        );
      }
    }
    return {
      ...slide,
      imageRequest: primaryRequest,
      imageBeats: slide.imageBeats,
    };
  });

  const selectionPolicy = await applyImageSelectionPlanningPolicy({
    slides,
    crawlMode: payload.crawlMode,
    debug: debugSelectionPolicy,
    helpers: {
      normalizeWhitespace,
      toFallbackImageRequest,
      toSearchableQueryCandidates,
    },
  });
  warnings.push(...selectionPolicy.warnings);

  return {
    payload: {
      ...payload,
      slides: selectionPolicy.slides,
    },
    warnings,
  };
}

export const __internal = {
  parsePlannedResponse,
  sanitizePlannedItem,
  sanitizePlannedSwitchItem,
  toPrompt,
};
