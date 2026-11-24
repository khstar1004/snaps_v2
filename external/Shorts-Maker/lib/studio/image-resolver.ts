import { runLocalCodexCliPrompt } from "@/lib/auth/codex-local-cli";
import { dedupeImageSelectionCandidates } from "@/lib/studio/image-selection-candidates";
import { toImageProxyUrl } from "@/lib/studio/image-proxy";
import { normalizeMemeSearchPhrase, stripMemeSearchSuffix } from "@/lib/studio/images/intent";
import { hasExcludedMediaReservationMatch } from "@/lib/studio/media-reservation";
import {
  appendSelectionReasonTags,
  diversifyNoveltyScoredCandidates,
  normalizeSelectionOffset,
  type SelectionNoveltyHistory,
} from "@/lib/studio/provider-candidate-diversity";
import type { ImageRequest, ImageScoreBreakdown, ImageSelectionCandidate, SlideMediaKind } from "@/types/studio-json";

type NaverImageItem = {
  title?: string;
  link?: string;
  thumbnail?: string;
  sizewidth?: string;
  sizeheight?: string;
  contextLink?: string;
};

type NaverImageResponse = {
  items?: NaverImageItem[];
};

export type NaverResolveResult = {
  ok: boolean;
  url: string | null;
  selectedQuery?: string;
  score?: number;
  scoreBreakdown?: ImageScoreBreakdown;
  candidateId?: string;
  candidateOptions?: ImageSelectionCandidate[];
  pageUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  selectionReason?: string;
  reason?: string;
};

export type NaverResolveOptions = {
  sort?: "sim" | "date";
  minScore?: number;
  intent?: "news" | "meme";
  noFilter?: boolean;
  filter?: "all" | "large" | "medium" | "small";
  excludeCandidateIds?: string[];
  excludeUrls?: string[];
  selectionOffset?: number;
  recentHistory?: SelectionNoveltyHistory;
};

const MAX_CANDIDATE_CHECKS = 20;
const MIN_CANDIDATE_SCORE = 35;

const TRUSTED_NEWS_DOMAINS = [
  "news.naver.com",
  "imgnews.pstatic.net",
  "donga.com",
  "joongang.co.kr",
  "chosun.com",
  "newdaily.co.kr",
  "pennmike.com",
  "ichannela.com",
  "tvchosun.com",
  "yna.co.kr",
  "mk.co.kr",
  "hankyung.com",
  "kbs.co.kr",
  "mbc.co.kr",
  "sbs.co.kr",
];

const LOW_QUALITY_DOMAIN_HINTS = ["blog.", "tistory.", "cafe.", "post.", "youtube.com", "youtu.be"];

const LOW_QUALITY_PATH_HINTS = ["thumb", "thumbnail", "logo", "icon", "banner", "ad", "watermark", "capture"];

const LOW_QUALITY_TITLE_HINTS = ["캡처", "썸네일", "합성", "일러스트", "광고", "배너", "로고"];
const MEME_TITLE_HINTS = ["짤", "움짤", "gif", "reaction", "meme"];
const MEME_DOMAIN_HINTS = ["jjalbang.today", "ppomppu.co.kr", "humoruniv.com", "dcinside.com", "mlbpark.donga.com"];
const PROMOTIONAL_DOMAIN_HINTS = [
  "shop1.phinf.naver.net",
  "shop2.phinf.naver.net",
  "shop3.phinf.naver.net",
  "shop4.phinf.naver.net",
  "d2v80xjmx68n4w.cloudfront.net",
  "shopping.naver.com",
  "smartstore.naver.com",
  "storefarm.naver.com",
];
const PROMOTIONAL_PATH_HINTS = [
  "main-sample",
  "sample-",
  "/sample/",
  "/product/",
  "/goods/",
  "/event/",
  "/promo/",
  "/promotion/",
  "/gigs/",
  "banner",
];
const PROMOTIONAL_TEXT_HINTS = [
  "상담문의",
  "문의전화",
  "무료상담",
  "이벤트",
  "할인",
  "홍보",
  "광고",
  "배너",
  "사무소",
  "세무회계",
  "세무사무소",
  "법무법인",
  "법률사무소",
  "노무법인",
  "대표세무사",
];
const PROMOTIONAL_MUST_AVOID_HINTS = [
  "광고",
  "배너",
  "홍보",
  "프로모션",
  "promotion",
  "promo",
  "상담",
  "문의",
  "전화",
  "전화번호",
  "무료상담",
  "이벤트",
  "contact",
  "consult",
];

const GENERIC_QUERY_TOKENS = new Set([
  "사진",
  "이미지",
  "뉴스",
  "현장",
  "기자회견",
  "브리핑",
  "발표",
  "결과",
  "논란",
  "관련",
]);

const CTA_QUERY_HINTS = ["유튜브", "쇼츠", "구독", "댓글", "좋아요", "알림", "subscribe", "comment", "youtube", "shorts"];
const NAVER_REACTION_QUERY_HINTS = [
  "짤",
  "움짤",
  "gif",
  "meme",
  "reaction",
  "표정",
  "당황",
  "민망",
  "어색",
  "수상한",
  "의심",
  "쎄한",
  "놀란",
  "충격",
  "경악",
  "정색",
  "무표정",
  "웃는",
  "웃음",
  "화난",
  "분노",
  "슬픈",
  "불안",
  "식은땀",
];
const NAVER_ENGLISH_QUERY_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bjudge gavel\b|\bgavel\b/i, replacement: "판사 망치" },
  { pattern: /\bpointing hand\b|\bpointing finger\b/i, replacement: "손가락" },
  { pattern: /\bangry texting\b|\bthreat message\b|\btext message\b|\bmessage screen\b|\bphone screen\b/i, replacement: "문자 화면" },
  { pattern: /\bbank account book\b|\bbank account\b|\baccount book\b/i, replacement: "통장" },
  { pattern: /\btax filing documents?\b|\btax documents?\b|\btax filing\b/i, replacement: "서류" },
  { pattern: /\bpayroll\b|\bpayslip\b|\bsalary statement\b|\bpay stub\b/i, replacement: "급여 명세서" },
  { pattern: /\baccounting office work\b|\baccounting desk\b/i, replacement: "책상" },
  { pattern: /\brefund\b/i, replacement: "환불" },
  { pattern: /\bcustomer\b/i, replacement: "손님" },
  { pattern: /\bshocked face\b|\bsurprised face\b|\bpanic face\b/i, replacement: "놀란 표정" },
  { pattern: /\btense face\b|\bworried face\b|\bfocused face\b|\bserious face\b/i, replacement: "심각한 표정" },
  { pattern: /\bpaperwork\b|\bdocument review\b|\boffice desk documents\b|\bcase file\b|\blegal paperwork\b/i, replacement: "서류" },
  { pattern: /\bwarning sign\b|\bred flag\b/i, replacement: "경고 표지판" },
  { pattern: /\breservation\b|\bbooking\b/i, replacement: "예약 화면" },
  { pattern: /\brestaurant\b|\btable\b/i, replacement: "식당 테이블" },
];
const NAVER_ENGLISH_TOKEN_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bbank\b/gi, replacement: "은행" },
  { pattern: /\baccount\b/gi, replacement: "계좌" },
  { pattern: /\bbook\b/gi, replacement: "통장" },
  { pattern: /\bpayroll\b|\bpayslip\b|\bsalary\b/gi, replacement: "급여" },
  { pattern: /\bstatement\b|\bstub\b/gi, replacement: "명세서" },
  { pattern: /\btax\b/gi, replacement: "세금" },
  { pattern: /\bfiling\b/gi, replacement: "신고" },
  { pattern: /\bdocuments?\b/gi, replacement: "문서" },
  { pattern: /\bpaperwork\b/gi, replacement: "서류 더미" },
  { pattern: /\blegal\b/gi, replacement: "법률" },
  { pattern: /\bconsultation\b/gi, replacement: "상담" },
  { pattern: /\boffice\b/gi, replacement: "사무실" },
  { pattern: /\bdesk\b/gi, replacement: "책상" },
  { pattern: /\breservation\b|\bbooking\b/gi, replacement: "예약" },
  { pattern: /\bscreen\b/gi, replacement: "화면" },
  { pattern: /\bmessage\b|\btext\b|\bchat\b/gi, replacement: "문자" },
  { pattern: /\bphone\b/gi, replacement: "휴대폰" },
  { pattern: /\brestaurant\b/gi, replacement: "식당" },
  { pattern: /\btable\b/gi, replacement: "테이블" },
  { pattern: /\blaptop\b|\bcomputer\b/gi, replacement: "컴퓨터" },
  { pattern: /\bface\b|\breaction\b/gi, replacement: "표정" },
  { pattern: /\bshocked\b|\bsurprised\b|\bpanic\b/gi, replacement: "놀란" },
  { pattern: /\bawkward\b|\bembarrassed\b/gi, replacement: "당황" },
  { pattern: /\bsuspicious\b|\bside eye\b|\bskeptical\b/gi, replacement: "수상한" },
  { pattern: /\bworried\b|\btense\b|\bfocused\b|\bserious\b/gi, replacement: "심각한" },
  { pattern: /\bdeadpan\b/gi, replacement: "무표정" },
  { pattern: /\bconfident\b|\bsmug\b/gi, replacement: "자신만만한" },
  { pattern: /\bhappy\b|\blaughing\b|\bsmile\b/gi, replacement: "웃는" },
  { pattern: /\bsad\b|\bcrying\b/gi, replacement: "슬픈" },
  { pattern: /\bangry\b|\bfurious\b/gi, replacement: "화난" },
  { pattern: /\brelieved\b|\bcalm\b|\bchill\b/gi, replacement: "안심한" },
  { pattern: /\bfrustrated\b|\bupset\b/gi, replacement: "답답한" },
  { pattern: /\bfunny\b|\bmeme\b/gi, replacement: "짤" },
  { pattern: /\bgif\b/gi, replacement: "" },
];
const NAVER_SEARCH_CONTEXT_DROP_TOKENS = new Set([
  "세금",
  "신고",
  "회계",
  "법률",
  "업무",
  "서비스",
  "관련",
  "상황",
  "장면",
  "분위기",
  "더미",
  "이미지",
  "사무실",
]);

const CANDIDATE_VERIFY_LIMIT = 6;

type ScoredCandidate = {
  url: string;
  score: number;
  reason: string;
  pageUrl?: string;
  title?: string;
  candidateId?: string;
  width?: number;
  height?: number;
};

function dedupeScoredCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const next: ScoredCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const identity =
      String(candidate.candidateId || "").trim() ||
      normalizeUrlIdentity(candidate.pageUrl || "") ||
      normalizeUrlIdentity(candidate.url) ||
      String(candidate.url || "").trim() ||
      `candidate:${next.length}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    next.push(candidate);
  }

  return next;
}

function toNaverSelectionMedia(candidate: Pick<ScoredCandidate, "url">): {
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
} {
  if (isVideoLikeUrl(candidate.url)) {
    return {
      imageUrl: candidate.url,
      mediaUrl: candidate.url,
      mediaKind: "video",
    };
  }
  if (isGifLikeUrl(candidate.url)) {
    return {
      imageUrl: candidate.url,
      mediaUrl: candidate.url,
      mediaKind: "animated_image",
    };
  }
  return {
    imageUrl: toImageProxyUrl(candidate.url) || candidate.url,
    mediaKind: "image",
  };
}

function toNaverSelectionCandidate(candidate: ScoredCandidate, query: string): ImageSelectionCandidate {
  const normalizedCandidateId = candidate.candidateId || `naver:${normalizeUrlIdentity(candidate.url)}`;
  const media = toNaverSelectionMedia(candidate);
  return {
    provider: "naver",
    candidateId: normalizedCandidateId,
    imageUrl: media.imageUrl,
    mediaUrl: media.mediaUrl,
    mediaKind: media.mediaKind,
    pageUrl: candidate.pageUrl,
    title: candidate.title,
    width: candidate.width,
    height: candidate.height,
    query,
  };
}

function containsHangul(value: string): boolean {
  return /[가-힣]/u.test(value);
}

function containsEnglishLetters(value: string): boolean {
  return /[a-z]/i.test(value);
}

function dedupeStrings(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

function extractKoreanSearchTokens(value: string): string[] {
  let localized = value.toLowerCase();
  for (const rule of NAVER_ENGLISH_TOKEN_RULES) {
    localized = localized.replace(rule.pattern, ` ${rule.replacement} `);
  }
  return dedupeStrings(
    localized
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => !containsEnglishLetters(token))
      .filter((token) => token.length >= 2)
  );
}

function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.includes(candidate));
}

function hasAllTokens(tokens: string[], candidates: string[]): boolean {
  return candidates.every((candidate) => tokens.includes(candidate));
}

export function filterPromotionalMustAvoidTokens(values: string[]): string[] {
  return dedupeStrings(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => {
        const lower = value.toLowerCase();
        return PROMOTIONAL_MUST_AVOID_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
      })
  );
}

function toCompactKoreanSearchQuery(tokens: string[]): string {
  if (hasAllTokens(tokens, ["급여", "명세서"])) return "급여 명세서";
  if (hasAnyToken(tokens, ["통장", "계좌", "은행"])) return hasAnyToken(tokens, ["화면"]) ? "계좌 화면" : "통장";
  if (hasAnyToken(tokens, ["영수증", "계산서"])) return "영수증";
  if (hasAnyToken(tokens, ["서류", "문서", "자료", "증빙"])) return "서류";
  if (hasAnyToken(tokens, ["문자", "채팅", "카톡", "휴대폰", "스마트폰"])) return "문자 화면";
  if (hasAnyToken(tokens, ["예약", "예약자", "화면"])) return "예약 화면";
  if (hasAnyToken(tokens, ["식당", "테이블", "자리"])) return "식당 테이블";
  if (hasAnyToken(tokens, ["책상", "컴퓨터", "노트북"])) return "책상";
  if (hasAnyToken(tokens, ["상담"])) return "상담";
  if (hasAnyToken(tokens, ["문틈", "불빛"])) return "문틈 불빛";
  if (hasAnyToken(tokens, ["그림자", "실루엣"])) return "복도 그림자";
  if (hasAnyToken(tokens, ["복도"])) return "복도";
  if (hasAnyToken(tokens, ["기자회견", "브리핑", "국회"])) return "기자회견";
  if (hasAnyToken(tokens, ["놀란", "충격", "경악"])) return "놀란 표정";
  if (hasAnyToken(tokens, ["당황", "민망", "어색"])) return "당황 표정";
  if (hasAnyToken(tokens, ["수상한", "의심", "쎄한"])) return "수상한 표정";
  if (hasAnyToken(tokens, ["심각한", "정색", "무표정"])) return "심각한 표정";
  if (hasAnyToken(tokens, ["자신만만한", "웃는", "슬픈", "화난", "안심한", "답답한"])) {
    return `${tokens.find((token) => ["자신만만한", "웃는", "슬픈", "화난", "안심한", "답답한"].includes(token))} 표정`;
  }
  const core = tokens.filter((token) => !NAVER_SEARCH_CONTEXT_DROP_TOKENS.has(token)).slice(0, 2);
  if (core.length > 0) {
    return core.join(" ").trim();
  }
  return "현장";
}

function isGifLikeUrl(url: string): boolean {
  return /\.(gif)(\?|#|$)/i.test(url);
}

function isVideoLikeUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

export function toKoreanNaverQuery(value: string): string {
  const raw = normalizeMemeSearchPhrase(String(value || "").trim());
  const compact = stripMemeSearchSuffix(raw).replace(/\b(gif|reaction|meme)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (containsHangul(compact) && !containsEnglishLetters(compact)) {
    return toCompactKoreanSearchQuery(extractKoreanSearchTokens(compact));
  }
  for (const rule of NAVER_ENGLISH_QUERY_RULES) {
    if (rule.pattern.test(compact)) return rule.replacement;
  }
  const normalized = compact.toLowerCase();
  if (/\b(face|reaction)\b/i.test(normalized)) return "표정";
  if (/\b(message|text|chat)\b/i.test(normalized)) return "문자 화면";
  if (/\b(document|paperwork|file)\b/i.test(normalized)) return "서류";
  if (/\b(desk|office)\b/i.test(normalized)) return "책상";
  if (/\b(hand)\b/i.test(normalized)) return "손";
  return toCompactKoreanSearchQuery(extractKoreanSearchTokens(compact));
}

export function selectPreferredNaverQuery(request: ImageRequest): string {
  if (request.plannerSource === "codex") {
    return request.query.trim();
  }
  const rawCandidates = [request.query, ...(request.queryCandidates || []), request.scene || ""]
    .map((value) => normalizeMemeSearchPhrase(value.trim()))
    .filter(Boolean);
  const localizedCandidates = rawCandidates.flatMap((candidate) => {
    const localized = toKoreanNaverQuery(candidate);
    return localized && localized !== candidate ? [localized, candidate] : [candidate];
  });
  const preferred = localizedCandidates.find((candidate) => containsHangul(candidate) && !containsEnglishLetters(candidate));
  return preferred || localizedCandidates[0] || toKoreanNaverQuery(request.query) || request.query.trim();
}

function buildSearchQuery(request: ImageRequest): string {
  if (request.plannerSource === "codex") {
    return request.query.trim();
  }
  const isFunLikeQuery = [request.query, request.scene || "", ...(request.queryCandidates || [])]
    .map((value) => normalizeMemeSearchPhrase(String(value || "").trim()))
    .join(" ")
    .includes("짤");
  const shouldApplyMustAvoid = !isFunLikeQuery;
  const preferredQuery = selectPreferredNaverQuery(request);
  const avoid = filterPromotionalMustAvoidTokens(request.mustAvoid ?? []).map((x) => `-${x}`);
  return [preferredQuery, ...(shouldApplyMustAvoid ? avoid : [])].join(" ").trim();
}

function resolveNaverImageFilter(request: ImageRequest, options?: NaverResolveOptions): NonNullable<NaverResolveOptions["filter"]> {
  if (options?.filter) return options.filter;
  return "all";
}

function parsePositiveNumber(value: string | number | undefined): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function orientationMatches(requestOrientation: ImageRequest["orientation"], item: NaverImageItem): boolean {
  if (!requestOrientation || requestOrientation === "any") return true;
  const width = parsePositiveNumber(item.sizewidth);
  const height = parsePositiveNumber(item.sizeheight);
  if (width <= 0 || height <= 0) return true;
  if (requestOrientation === "portrait") return height >= width;
  return width >= height;
}

function orientationMatchesDimensions(
  requestOrientation: ImageRequest["orientation"],
  width: number,
  height: number
): boolean {
  if (!requestOrientation || requestOrientation === "any") return true;
  if (width <= 0 || height <= 0) return true;
  if (requestOrientation === "portrait") return height >= width;
  return width >= height;
}

function parseHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeUrlIdentity(rawUrl: string): string {
  const decoded = decodeMaybe(String(rawUrl || "").trim());
  if (!decoded) return "";
  try {
    const parsed = new URL(decoded);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return decoded.toLowerCase();
  }
}

function toQueryTokens(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
  return tokens.filter((x) => !GENERIC_QUERY_TOKENS.has(x));
}

function isCtaLikeQuery(rawQuery: string, queryTokens: string[]): boolean {
  const lower = rawQuery.toLowerCase();
  if (CTA_QUERY_HINTS.some((hint) => lower.includes(hint))) return true;
  return queryTokens.some((token) => CTA_QUERY_HINTS.some((hint) => token.includes(hint) || hint.includes(token)));
}

function countCtaSignalHits(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const hint of CTA_QUERY_HINTS) {
    if (lower.includes(hint)) hits += 1;
  }
  return hits;
}

function countHintHits(text: string, hints: string[]): number {
  const lower = decodeMaybe(text).toLowerCase();
  let hits = 0;
  for (const hint of hints) {
    if (lower.includes(hint.toLowerCase())) hits += 1;
  }
  return hits;
}

export function shouldAllowMemeLikeNaverResults(
  rawQuery: string,
  queryTokens: string[],
  intent?: NaverResolveOptions["intent"]
): boolean {
  if (intent === "meme") return true;
  const normalized = normalizeMemeSearchPhrase(String(rawQuery || "").trim()).toLowerCase();
  if (!normalized) return false;
  if (NAVER_REACTION_QUERY_HINTS.some((hint) => normalized.includes(hint))) return true;
  return queryTokens.some((token) =>
    NAVER_REACTION_QUERY_HINTS.some((hint) => token.includes(hint) || hint.includes(token))
  );
}

export function isBlockedPromotionalNaverCandidate(
  item: Pick<NaverImageItem, "link" | "thumbnail" | "title" | "contextLink">
): boolean {
  const url = (item.link || item.thumbnail || "").trim();
  if (!url) return false;
  const lowerUrl = decodeMaybe(url).toLowerCase();
  const contextUrl = decodeMaybe((item.contextLink || "").trim()).toLowerCase();
  const imageHostname = parseHostname(url);
  const contextHostname = parseHostname(item.contextLink || "");
  const title = decodeMaybe((item.title || "").trim()).toLowerCase();
  const hostnames = [contextHostname, imageHostname].filter(Boolean);
  if (hostnames.some((hostname) => PROMOTIONAL_DOMAIN_HINTS.some((hint) => hostname === hint || hostname.endsWith(`.${hint}`) || hostname.includes(hint)))) {
    return true;
  }
  if (imageHostname.endsWith("cloudfront.net") && lowerUrl.includes("/gigs/")) {
    return true;
  }
  if (hostnames.some((hostname) => hostname.includes("shop") && hostname.endsWith(".phinf.naver.net"))) {
    return true;
  }
  const combined = `${lowerUrl} ${contextUrl} ${title}`;
  if (countHintHits(combined, PROMOTIONAL_PATH_HINTS) >= 2) {
    return true;
  }
  if ((imageHostname.endsWith("cloudfront.net") || contextHostname.includes("smartstore") || contextHostname.includes("shopping")) && countHintHits(combined, PROMOTIONAL_PATH_HINTS) >= 1) {
    return true;
  }
  if (countHintHits(`${contextUrl} ${title}`, PROMOTIONAL_TEXT_HINTS) >= 2) {
    return true;
  }
  return false;
}

export function buildNaverCandidateId(
  item: Pick<NaverImageItem, "link" | "thumbnail" | "contextLink">
): string {
  const contextIdentity = normalizeUrlIdentity(item.contextLink || "");
  if (contextIdentity) return `naver:${contextIdentity}`;
  const imageIdentity = normalizeUrlIdentity(item.link || item.thumbnail || "");
  return imageIdentity ? `naver:${imageIdentity}` : "";
}

export function isExcludedNaverCandidate(
  item: Pick<NaverImageItem, "link" | "thumbnail" | "contextLink">,
  options?: Pick<NaverResolveOptions, "excludeCandidateIds" | "excludeUrls">
): boolean {
  const excludedCandidateIds = new Set((options?.excludeCandidateIds || []).map((value) => value.trim()).filter(Boolean));
  const candidateId = buildNaverCandidateId(item);
  if (candidateId && excludedCandidateIds.has(candidateId)) {
    return true;
  }
  return hasExcludedMediaReservationMatch([item.link, item.thumbnail, item.contextLink], options?.excludeUrls || []);
}

function scoreCandidate(
  item: NaverImageItem,
  queryTokens: string[],
  rawQuery: string,
  intent?: NaverResolveOptions["intent"]
): { score: number; reason: string } {
  const url = (item.link || item.thumbnail || "").trim();
  if (!url) return { score: -999, reason: "empty url" };
  if (isBlockedPromotionalNaverCandidate(item)) {
    return { score: -999, reason: "promotional/shop image" };
  }
  const lowerUrl = decodeMaybe(url).toLowerCase();
  const hostname = parseHostname(item.contextLink || "") || parseHostname(url);
  const ctaLikeQuery = isCtaLikeQuery(rawQuery, queryTokens);
  const isMemeIntent = intent === "meme";
  const allowMemeLikeResults = shouldAllowMemeLikeNaverResults(rawQuery, queryTokens, intent);
  let score = 0;
  const reasons: string[] = [];

  if (item.link && !item.thumbnail) {
    score += 8;
    reasons.push("original link");
  }

  const width = parsePositiveNumber(item.sizewidth);
  const height = parsePositiveNumber(item.sizeheight);
  const area = width * height;
  if (area >= 500 * 700) {
    score += 14;
    reasons.push("good resolution");
  } else if (area >= 300 * 400) {
    score += 8;
    reasons.push("medium resolution");
  }

  if (TRUSTED_NEWS_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    score += 28;
    reasons.push("trusted news domain");
  }

  if ((isMemeIntent || allowMemeLikeResults) && MEME_DOMAIN_HINTS.some((hint) => hostname.includes(hint))) {
    score += 16;
    reasons.push("meme domain");
  }

  if ((isMemeIntent || allowMemeLikeResults) && isGifLikeUrl(lowerUrl)) {
    score += 30;
    reasons.push("direct gif");
  } else if ((isMemeIntent || allowMemeLikeResults) && isVideoLikeUrl(lowerUrl)) {
    score += 24;
    reasons.push("direct motion");
  }

  let tokenHits = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (lowerUrl.includes(token)) tokenHits += 1;
  }
  if (tokenHits >= 2) {
    score += 16;
    reasons.push("query tokens matched");
  } else if (tokenHits === 1) {
    score += 8;
    reasons.push("partial token match");
  }

  const title = (item.title || "").toLowerCase();
  if (title) {
    let titleHits = 0;
    for (const token of queryTokens) {
      if (title.includes(token)) titleHits += 1;
    }
    if (titleHits >= 2) {
      score += 14;
      reasons.push("title matched query");
    } else if (titleHits === 1) {
      score += 6;
      reasons.push("title partial match");
    }

    if ((isMemeIntent || allowMemeLikeResults) && MEME_TITLE_HINTS.some((hint) => title.includes(hint))) {
      score += 18;
      reasons.push("meme title hint");
    }
  }

  if (ctaLikeQuery) {
    const combinedSignals = countCtaSignalHits(`${url} ${(item.title || "").trim()}`);
    if (combinedSignals >= 2) {
      score += 10;
      reasons.push("strong cta signal");
    }
  }

  return { score, reason: reasons.join(", ") || "no positive signal" };
}

export function scoreNaverCandidateForTest(
  item: Pick<NaverImageItem, "link" | "thumbnail" | "title" | "contextLink" | "sizewidth" | "sizeheight">,
  queryTokens: string[],
  rawQuery: string,
  intent?: NaverResolveOptions["intent"]
): { score: number; reason: string } {
  return scoreCandidate(item as NaverImageItem, queryTokens, rawQuery, intent);
}

function scoreDiscoveredUrl(url: string, queryTokens: string[], rawQuery: string): { score: number; reason: string } {
  if (isBlockedPromotionalNaverCandidate({ link: url })) {
    return { score: -999, reason: "promotional/shop image" };
  }
  const lowerUrl = decodeMaybe(url).toLowerCase();
  const hostname = parseHostname(url);
  const ctaLikeQuery = isCtaLikeQuery(rawQuery, queryTokens);
  let score = 0;
  const reasons: string[] = [];

  if (TRUSTED_NEWS_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    score += 24;
    reasons.push("trusted news domain");
  }
  if (LOW_QUALITY_DOMAIN_HINTS.some((hint) => hostname.includes(hint))) {
    score -= 20;
    reasons.push("low-quality domain");
  }
  if (LOW_QUALITY_PATH_HINTS.some((hint) => lowerUrl.includes(hint))) {
    score -= 14;
    reasons.push("thumbnail/banner-like path");
  }

  let tokenHits = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    if (lowerUrl.includes(token)) tokenHits += 1;
  }
  if (tokenHits >= 2) {
    score += 14;
    reasons.push("query tokens matched");
  } else if (tokenHits === 1) {
    score += 7;
    reasons.push("partial token match");
  }

  if (ctaLikeQuery && tokenHits === 0) {
    score -= 32;
    reasons.push("cta-intent mismatch");
  }
  if (ctaLikeQuery && tokenHits === 1) {
    score -= 14;
    reasons.push("weak query match for cta");
  }
  if (ctaLikeQuery) {
    const combinedSignals = countCtaSignalHits(url);
    if (combinedSignals === 0) {
      score -= 24;
      reasons.push("no cta signal");
    } else if (combinedSignals === 1) {
      score -= 12;
      reasons.push("weak cta signal");
    } else {
      score += 8;
      reasons.push("strong cta signal");
    }
  }

  return { score, reason: reasons.join(", ") || "no positive signal" };
}

function buildUpstreamImageHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Sec-Fetch-Dest": "image",
  };
  const host = parseHostname(url);
  if (host === "img7.yna.co.kr" || host === "img3.yna.co.kr" || host === "img0.yna.co.kr" || host === "img4.yna.co.kr") {
    headers.Referer = "https://www.yna.co.kr/";
    headers.Origin = "https://www.yna.co.kr";
  }
  return headers;
}

async function canLoadCandidateAsImage(url: string): Promise<{ ok: boolean; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...buildUpstreamImageHeaders(url),
        Range: "bytes=0-2047",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `verify status=${response.status}` };
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return { ok: false, reason: `verify content-type=${contentType || "unknown"}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `verify failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveImageUrlByNaver(request: ImageRequest, options?: NaverResolveOptions): Promise<NaverResolveResult> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      url: null,
      reason: "NAVER_SEARCH_CLIENT_ID or NAVER_SEARCH_CLIENT_SECRET is missing",
    };
  }

  const preferredQuery = selectPreferredNaverQuery(request);
  const query = buildSearchQuery(request);
  if (!query) {
    return {
      ok: false,
      url: null,
      reason: "imageRequest.query is empty",
    };
  }

  const endpoint = new URL("https://openapi.naver.com/v1/search/image");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("display", "20");
  endpoint.searchParams.set("sort", options?.sort === "date" ? "date" : "sim");
  endpoint.searchParams.set("filter", resolveNaverImageFilter(request, options));
  const threshold =
    typeof options?.minScore === "number" && Number.isFinite(options.minScore)
      ? Math.max(0, options.minScore)
      : MIN_CANDIDATE_SCORE;

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const bodyText = (await response.text()).slice(0, 240);
      return {
        ok: false,
        url: null,
        reason: `Naver API ${response.status}: ${bodyText}`,
      };
    }

    const payload = (await response.json()) as NaverImageResponse;
    const items = Array.isArray(payload.items) ? payload.items.slice(0, MAX_CANDIDATE_CHECKS) : [];
    const queryTokens = toQueryTokens(preferredQuery);
    const candidates: ScoredCandidate[] = [];

    for (const item of items) {
      const url = (item.link || item.thumbnail || "").trim();
      if (!url) continue;
      if (!/^https?:\/\//i.test(url)) continue;
      if (isExcludedNaverCandidate(item, options)) continue;
      const scored = scoreCandidate(item, queryTokens, request.query, options?.intent);
      candidates.push({
        url,
        score: scored.score,
        reason: scored.reason,
        pageUrl: (item.contextLink || "").trim() || undefined,
        title: (item.title || "").trim() || undefined,
        candidateId: buildNaverCandidateId(item),
        width: parsePositiveNumber(item.sizewidth),
        height: parsePositiveNumber(item.sizeheight),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const uniqueCandidates = dedupeScoredCandidates(candidates);
    const candidateOptions = dedupeImageSelectionCandidates(
      uniqueCandidates.slice(0, 3).map((candidate) => toNaverSelectionCandidate(candidate, preferredQuery)),
      3
    );
    const topCandidates = diversifyNoveltyScoredCandidates(uniqueCandidates.slice(0, CANDIDATE_VERIFY_LIMIT), {
      selectionOffset: options?.selectionOffset,
      maxPoolSize: 6,
      scoreWindow: 10,
      recentHistory: options?.recentHistory,
      getNoveltySignals: (candidate) => ({
        provider: "naver",
        id: candidate.candidateId,
        url: candidate.url,
        pageUrl: candidate.pageUrl,
        title: candidate.title,
        query: preferredQuery,
        queryCandidates: [preferredQuery],
      }),
    });
    const recentSkippedPenaltyTags = options?.recentHistory
      ? Array.from(new Set(topCandidates.slice(1, 3).flatMap((candidate) => candidate.noveltyTags)))
      : [];
    let bestVerifiedCandidate: (typeof topCandidates)[number] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestReason = "";
    const verifyFailures: string[] = [];
    const selectionOffset = normalizeSelectionOffset(options?.selectionOffset, Math.min(3, uniqueCandidates.length));

    for (const candidate of topCandidates) {
      const verified = await canLoadCandidateAsImage(candidate.url);
      if (!verified.ok) {
        if (verifyFailures.length < 4) {
          const host = parseHostname(candidate.url) || "unknown-host";
          verifyFailures.push(`host=${host} score=${candidate.score} verify='${verified.reason || "failed"}'`);
        }
        if (!bestReason) {
          bestReason = appendSelectionReasonTags(
            appendSelectionReasonTags(
              `${candidate.reason}, ${verified.reason || "candidate verify failed"}`,
              candidate.noveltyTags
            ),
            recentSkippedPenaltyTags
          );
        }
        continue;
      }
      bestVerifiedCandidate = candidate;
      bestScore = candidate.score;
      bestReason = appendSelectionReasonTags(
        appendSelectionReasonTags(candidate.reason, candidate.noveltyTags),
        recentSkippedPenaltyTags
      );
      break;
    }

    if (!bestVerifiedCandidate && uniqueCandidates.length > 0) {
      bestScore = uniqueCandidates[0].score;
      bestReason = uniqueCandidates[0].reason;
    }

    if (bestVerifiedCandidate) {
      return {
        ok: true,
        url: bestVerifiedCandidate.url,
        selectedQuery: preferredQuery,
        score: bestScore,
        candidateId: bestVerifiedCandidate.candidateId,
        candidateOptions,
        pageUrl: bestVerifiedCandidate.pageUrl,
        title: bestVerifiedCandidate.title,
        width: bestVerifiedCandidate.width,
        height: bestVerifiedCandidate.height,
        selectionReason:
          bestScore >= threshold
            ? selectionOffset > 0
              ? `${bestReason}; diversified-offset=${selectionOffset}`
              : bestReason
            : `${bestReason}; below-threshold accepted${selectionOffset > 0 ? `; diversified-offset=${selectionOffset}` : ""}`,
      };
    }

    if (uniqueCandidates.length > 0) {
      const fallbackCandidate = topCandidates[0] || uniqueCandidates[0]!;
      return {
        ok: true,
        url: fallbackCandidate.url,
        selectedQuery: preferredQuery,
        score: fallbackCandidate.score,
        candidateId: fallbackCandidate.candidateId,
        candidateOptions,
        pageUrl: fallbackCandidate.pageUrl,
        title: fallbackCandidate.title,
        width: fallbackCandidate.width,
        height: fallbackCandidate.height,
        selectionReason: `${appendSelectionReasonTags(
          appendSelectionReasonTags(
            fallbackCandidate.reason || "non-promotional candidate",
            "noveltyTags" in fallbackCandidate ? fallbackCandidate.noveltyTags : []
          ),
          recentSkippedPenaltyTags
        )}; unverified-accepted${
          verifyFailures.length > 0 ? `; verifyFailures=${verifyFailures.join(" | ")}` : ""
        }${selectionOffset > 0 ? `; diversified-offset=${selectionOffset}` : ""}`,
      };
    }

    return {
      ok: false,
      url: null,
      reason: `No high-quality image candidate for query='${query}' (bestScore=${Number.isFinite(bestScore) ? bestScore : -1}, threshold=${threshold}${bestReason ? `, ${bestReason}` : ""}${verifyFailures.length > 0 ? `, verifyFailures=${verifyFailures.join(" | ")}` : ""})`,
    };
  } catch (error) {
    return {
      ok: false,
      url: null,
      reason: `Naver API request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function shouldUseCodexImageDiscovery(): boolean {
  return ((process.env.CODEX_IMAGE_DISCOVERY_USE_CLI || "1").trim() || "1") !== "0";
}

function extractUrlsFromCodexText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"')\]]+/g) || [];
  const deduped: string[] = [];
  for (const match of matches) {
    const cleaned = match.trim().replace(/[.,;!?]+$/g, "");
    if (!/^https?:\/\//i.test(cleaned)) continue;
    if (!deduped.includes(cleaned)) deduped.push(cleaned);
  }
  return deduped;
}

async function runCodexCliForImageUrls(request: ImageRequest): Promise<string[]> {
  const prompt = [
    "Find direct image URLs for this Korean news-photo query.",
    "Return URLs only.",
    "Prefer real photos from Korean news/media domains.",
    `query: ${request.query}`,
    `orientation: ${request.orientation || "any"}`,
    request.scene ? `scene: ${request.scene}` : "",
    request.people && request.people.length > 0 ? `people: ${request.people.join(", ")}` : "people: none",
    request.mustAvoid && request.mustAvoid.length > 0 ? `must avoid: ${request.mustAvoid.join(", ")}` : "",
    "max urls: 3",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await runLocalCodexCliPrompt(prompt, {
      outputPrefix: "codex-image-discovery",
      timeoutMs: 1000 * 60 * 3,
      maxBufferBytes: 1024 * 1024 * 8,
    });
    if (!text) return [];
    return extractUrlsFromCodexText(text);
  } catch {
    return [];
  }
}

export async function resolveImageUrlByCodexDiscovery(request: ImageRequest): Promise<NaverResolveResult> {
  if (!shouldUseCodexImageDiscovery()) {
    return {
      ok: false,
      url: null,
      reason: "CODEX_IMAGE_DISCOVERY_USE_CLI is disabled",
    };
  }

  const query = buildSearchQuery(request);
  if (!query) {
    return {
      ok: false,
      url: null,
      reason: "imageRequest.query is empty",
    };
  }

  const discovered = await runCodexCliForImageUrls(request);
  if (discovered.length === 0) {
    return {
      ok: false,
      url: null,
      reason: "Codex discovery returned no candidate URLs",
    };
  }

  const queryTokens = toQueryTokens(request.query);
  const top = discovered.slice(0, CANDIDATE_VERIFY_LIMIT);
  const scored = top
    .map((url) => {
      const judged = scoreDiscoveredUrl(url, queryTokens, request.query);
      return { url, score: judged.score, reason: judged.reason };
    })
    .sort((a, b) => b.score - a.score);
  const verifyFailures: string[] = [];
  let bestVerified: { url: string; score: number } | null = null;
  for (const candidate of scored) {
    const verified = await canLoadCandidateAsImage(candidate.url);
    if (!verified.ok) {
      if (verifyFailures.length < 4) {
        const host = parseHostname(candidate.url) || "unknown-host";
        verifyFailures.push(`host=${host} score=${candidate.score} verify='${verified.reason || "failed"}'`);
      }
      continue;
    }
    if (!bestVerified || candidate.score > bestVerified.score) {
      bestVerified = { url: candidate.url, score: candidate.score };
    }
  }

  if (bestVerified) {
    return { ok: true, url: bestVerified.url, score: bestVerified.score };
  }

  return {
    ok: false,
    url: null,
    reason: `Codex candidates failed verification for query='${query}'${verifyFailures.length > 0 ? `, verifyFailures=${verifyFailures.join(" | ")}` : ""}`,
  };
}
