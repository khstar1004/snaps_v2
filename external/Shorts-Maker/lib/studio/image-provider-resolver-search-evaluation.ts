import {
  buildRequestMatchTokens,
  collectHintMatches,
  containsMustAvoid,
  countHits,
  decodeMaybe,
  isProfessionalServiceRequest,
  orientationMatches,
  parseHostname,
  parsePositiveNumber,
  dedupeQueries,
} from "@/lib/studio/image-provider-resolver-helpers";
import { analyzeImageRequestSearchSignal } from "@/lib/studio/images/intent";
import { filterPromotionalMustAvoidTokens, isBlockedPromotionalNaverCandidate } from "@/lib/studio/image-resolver";
import type { ImageProviderId, ImageRequest, SlideMediaKind } from "@/types/studio-json";

export type ProviderIntent = "news" | "meme";

export type ProviderSourceMetadata = {
  providerQuery?: string;
  providerTitle?: string;
  providerSlug?: string;
  providerRating?: string;
  providerTags?: string[];
};

export type ProviderCandidate = {
  provider: ImageProviderId;
  id: string;
  url: string;
  mediaUrl?: string;
  mediaKind?: SlideMediaKind;
  pageUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  sourceMetadata?: ProviderSourceMetadata;
};

export type ProviderAdapterResult = {
  ok: boolean;
  candidates: ProviderCandidate[];
  reason?: string;
  searchedQueries?: string[];
};

export type ProviderSearchOptions = {
  intent: ProviderIntent;
  maxCandidatesPerProvider: number;
  providerTimeBudgetMs: number;
  libraryUserScope: string;
  giphyLibraryOnly?: boolean;
};

export type CandidateProbeResult = {
  ok: boolean;
  reason?: string;
};

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

export async function probeCandidateMedia(candidate: ProviderCandidate): Promise<CandidateProbeResult> {
  const targetUrl = String(
    candidate.mediaKind === "video" && candidate.mediaUrl ? candidate.mediaUrl : candidate.url
  ).trim();
  if (!targetUrl) {
    return { ok: false, reason: "candidate url missing" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept:
          candidate.mediaKind === "video"
            ? "video/mp4,video/*;q=0.9,image/*;q=0.8,*/*;q=0.5"
            : candidate.mediaKind === "animated_image"
              ? "image/webp,image/gif,image/*;q=0.9,*/*;q=0.5"
              : "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0",
        Range: "bytes=0-2047",
      },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `probe http ${response.status}` };
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (candidate.mediaKind === "video") {
      return contentType.startsWith("video/") ? { ok: true } : { ok: false, reason: `probe content-type ${contentType || "unknown"}` };
    }
    if (candidate.mediaKind === "animated_image") {
      const animatedImageOk =
        contentType.startsWith("image/webp") || contentType.startsWith("image/gif") || contentType.startsWith("image/");
      return animatedImageOk ? { ok: true } : { ok: false, reason: `probe content-type ${contentType || "unknown"}` };
    }
    return contentType.startsWith("image/") ? { ok: true } : { ok: false, reason: `probe content-type ${contentType || "unknown"}` };
  } catch {
    return { ok: false, reason: "probe request failed" };
  } finally {
    clearTimeout(timer);
  }
}

export function scoreCandidate(candidate: ProviderCandidate, request: ImageRequest, intent: ProviderIntent): { score: number; reason: string } {
  const signal = analyzeImageRequestSearchSignal(request);
  const queryTokens = buildRequestMatchTokens(request);
  const mustAvoid = filterPromotionalMustAvoidTokens(request.mustAvoid || []);
  const title = (candidate.title || "").trim();
  const url = candidate.url.trim();
  const pageUrl = (candidate.pageUrl || "").trim();
  if (
    candidate.provider !== "library" &&
    candidate.provider !== "giphy" &&
    isBlockedPromotionalNaverCandidate({ link: url, title, contextLink: pageUrl })
  ) {
    return { score: -999, reason: "promotional/provider image" };
  }
  const hostname = parseHostname(pageUrl || url);
  const metadataText = [
    candidate.sourceMetadata?.providerQuery || "",
    candidate.sourceMetadata?.providerTitle || "",
    candidate.sourceMetadata?.providerSlug || "",
    ...(candidate.sourceMetadata?.providerTags || []),
  ]
    .join(" ")
    .trim();
  const mergedText = decodeMaybe(`${title} ${url} ${pageUrl} ${metadataText}`).toLowerCase();
  const professionalService = isProfessionalServiceRequest(request);
  const animatedMemeCandidate =
    intent === "meme" &&
    (candidate.provider === "giphy" || candidate.provider === "library") &&
    (candidate.mediaKind === "video" || candidate.mediaKind === "animated_image");
  let score = 0;
  const boosts: string[] = [];
  const penalties: string[] = [];

  if (orientationMatches(request.orientation, candidate.width, candidate.height)) {
    score += 8;
    boosts.push("orientation");
  } else if (!animatedMemeCandidate) {
    score -= 12;
    penalties.push("orientation");
  } else {
    boosts.push("gif orientation flex");
  }

  const width = parsePositiveNumber(candidate.width);
  const height = parsePositiveNumber(candidate.height);
  const area = width * height;
  if (area >= 500 * 700) {
    score += 16;
    boosts.push("good resolution");
  } else if (area >= 320 * 480) {
    score += 8;
    boosts.push("medium resolution");
  } else if (area > 0) {
    if (animatedMemeCandidate) {
      score += 2;
      boosts.push("gif resolution");
    } else {
      score -= 8;
      penalties.push("small image");
    }
  }

  const titlePrimaryHits = countHits(title, queryTokens.primary);
  const titleSecondaryHits = countHits(title, queryTokens.secondary);
  const urlPrimaryHits = countHits(`${url} ${pageUrl}`, queryTokens.primary);
  const urlSecondaryHits = countHits(`${url} ${pageUrl}`, queryTokens.secondary);
  if (titlePrimaryHits >= 2) {
    score += 18;
    boosts.push("strong title match");
  } else if (titlePrimaryHits === 1) {
    score += 10;
    boosts.push("title match");
  }
  if (titleSecondaryHits >= 2) {
    score += 8;
    boosts.push("context title match");
  }
  if (urlPrimaryHits >= 2) {
    score += 10;
    boosts.push("url match");
  } else if (urlPrimaryHits === 1) {
    score += 4;
    boosts.push("url hint");
  }
  if (urlSecondaryHits >= 2) {
    score += 4;
    boosts.push("context url match");
  }

  const mustAvoidHits = collectHintMatches(mergedText, mustAvoid);
  if (mustAvoidHits.length > 0 || containsMustAvoid(mergedText, mustAvoid)) {
    score -= 28;
    penalties.push(`must-avoid:${mustAvoidHits.slice(0, 2).join("/") || "hit"}`);
  }

  if (professionalService && PROFESSIONAL_SERVICE_RISK_TOKENS.some((token) => mergedText.includes(token.toLowerCase()))) {
    score -= 34;
    penalties.push("service promo risk");
  }
  const reactionHits = intent === "meme" ? collectHintMatches(mergedText, REACTION_RESULT_HINTS) : [];
  if (reactionHits.length > 0) {
    score += candidate.provider === "giphy" ? 10 : 6;
    boosts.push(`reaction:${reactionHits.slice(0, 2).join("/")}`);
  }

  const photoHits = collectHintMatches(mergedText, PHOTO_RESULT_HINTS);
  if (signal.hasConcreteVisualCue && photoHits.length > 0 && candidate.provider !== "giphy") {
    score += 8;
    boosts.push(`scene:${photoHits.slice(0, 2).join("/")}`);
  }
  if (signal.hasConcreteVisualCue && intent === "meme" && candidate.provider === "giphy") {
    score -= 10;
    penalties.push("scene-heavy request");
    if (reactionHits.length <= 0 && titlePrimaryHits + titleSecondaryHits + urlPrimaryHits + urlSecondaryHits <= 0) {
      score -= 8;
      penalties.push("weak scene fidelity");
    }
  }

  if (intent === "news" && (hostname.includes("pexels.com") || hostname.includes("pixabay.com"))) {
    score += 4;
    boosts.push("neutral b-roll");
  }
  if (candidate.provider === "wikimedia" && intent === "news") {
    score += 6;
    boosts.push("documentary source");
  }
  if (candidate.provider === "openverse" && intent === "meme") {
    score += 3;
    boosts.push("concept source");
  }
  if (candidate.provider === "library") {
    score += intent === "meme" ? 18 : 14;
    boosts.push("personal library");
  }
  if (candidate.provider === "giphy" && intent === "meme") {
    score += 24;
    boosts.push("meme source");
  }
  if (candidate.provider === "giphy" && intent === "news") {
    score -= 10;
    penalties.push("gif in news intent");
  }
  if (professionalService && (hostname.includes("pexels.com") || hostname.includes("pixabay.com"))) {
    score += 8;
    boosts.push("neutral service b-roll");
  }
  if (professionalService && titlePrimaryHits + titleSecondaryHits + urlPrimaryHits + urlSecondaryHits === 0 && candidate.provider === "wikimedia") {
    score -= 6;
    penalties.push("weak service context");
  }

  const matchedTokens = dedupeQueries([
    ...queryTokens.primary.filter((token) => mergedText.includes(token)),
    ...queryTokens.secondary.filter((token) => mergedText.includes(token)),
  ]).slice(0, 4);
  const reason = [
    boosts.length > 0 ? `boost=${boosts.slice(0, 4).join(",")}` : "",
    matchedTokens.length > 0 ? `match=${matchedTokens.join("/")}` : "",
    penalties.length > 0 ? `penalty=${penalties.slice(0, 4).join(",")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { score, reason: reason || "no positive signal" };
}
