import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canEditCategory, getCategoryAccessScope } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { resolveCodexAccessTokenFromRequest } from "@/lib/auth/codex-server";
import { rebaseLocalStorageUrlsToRequestOrigin } from "@/lib/local/asset-url-origin";
import { readJsonBody } from "@/lib/network/request-body";
import { getPublishCategoryMetadata } from "@/lib/publish/publish-store";
import type { PublishCategory } from "@/lib/publish/types";
import { toStudioFailureResponse } from "@/lib/studio/error-response";
import { parseStudioProjectProfileSnapshot, type StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import {
  type CodexLocalGeneratedImageResult,
  generateCodexLocalImages,
} from "@/lib/studio/codex-local-image-generator";
import {
  createOrUpdateStudioMediaAsset,
  normalizeStudioMediaFolderPath,
  resolveStudioMediaAssetUrls,
} from "@/lib/studio/media-assets";
import { getSharedStudioLibraryScope } from "@/lib/studio/library-scope";
import {
  addStudioImageCandidateToSlides,
  applyStudioImageCandidateToSlides,
  buildStudioLibraryImageCandidate,
  STUDIO_AUTO_APPLIED_SELECTION_REASON,
} from "@/lib/studio/image-candidate-approval";
import { buildStudioManualImagePrompt } from "@/lib/studio/manual-image-prompt";
import {
  normalizeStudioCharacterProfiles,
  resolveStudioCharacterProfileById,
} from "@/lib/studio/character-profiles";
import { AI_IMAGE_OUTPUT_CONSTRAINTS } from "@/lib/studio/ai-image-output-constraints";
import { withoutAutomaticImageProfileFields } from "@/lib/studio/image-mode-profile";
import { buildStudioMediaStorageObjectKey } from "@/lib/storage/object-key";
import { uploadSupabaseStorageFile } from "@/lib/supabase/storage";
import type { PreparedSlide, StoryCharacterProfile } from "@/types/studio-json";

export const runtime = "nodejs";

type ManualImageGenerateMode = "selected" | "missing" | "all";

type ManualImageGenerateRequestPayload = {
  publishCategory: PublishCategory;
  imageSource: "auto-ai-generate";
  slides: PreparedSlide[];
  slideIndexes: number[];
  mode: ManualImageGenerateMode;
  codexModel?: string;
  fixedCharacterProfileId?: string;
  imageStylePrompt?: string;
  characterProfiles?: StoryCharacterProfile[];
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
};

type ManualImageGenerateSlideResult =
  | {
      slideIndex: number;
      linkedSlideIndexes: number[];
      status: "ok";
      assetId?: string;
      imageUrl: string;
      warnings: string[];
    }
  | {
      slideIndex: number;
      linkedSlideIndexes: number[];
      status: "error";
      code: string;
      reason: string;
      detail?: string;
      warnings: string[];
    };

type ManualImageGenerateResponse = {
  ok: true;
  requestId: string;
  slides: PreparedSlide[];
  characterProfiles?: StoryCharacterProfile[];
  warnings: string[];
  results: ManualImageGenerateSlideResult[];
};

const MAX_MANUAL_IMAGE_GENERATIONS_PER_REQUEST = 12;

class ManualImageGenerateAssetPersistenceError extends Error {
  code: "upload_failed" | "asset_store_failed";

  constructor(code: "upload_failed" | "asset_store_failed", message: string) {
    super(message);
    this.name = "ManualImageGenerateAssetPersistenceError";
    this.code = code;
  }
}

type ManualImageGenerateRouteDependencies = {
  canEditCategory: typeof canEditCategory;
  createAssetId: () => string;
  createRequestId: () => string;
  createOrUpdateStudioMediaAsset: typeof createOrUpdateStudioMediaAsset;
  generateCodexLocalImages: typeof generateCodexLocalImages;
  getCategoryAccessScope: typeof getCategoryAccessScope;
  getPublishCategoryMetadata: typeof getPublishCategoryMetadata;
  logInfo: (message: string) => void;
  readJsonBody: typeof readJsonBody;
  requireAuthenticatedSessionUser: typeof requireAuthenticatedSessionUser;
  requireSessionUser: typeof requireSessionUser;
  resolveCodexAccessTokenFromRequest: typeof resolveCodexAccessTokenFromRequest;
  resolveStudioMediaAssetUrls: typeof resolveStudioMediaAssetUrls;
  toForbiddenApiResponse: typeof toForbiddenApiResponse;
  toStudioFailureResponse: typeof toStudioFailureResponse;
  toUnauthorizedApiResponse: typeof toUnauthorizedApiResponse;
  uploadSupabaseStorageFile: typeof uploadSupabaseStorageFile;
};

export const defaultManualImageGenerateRouteDependencies: ManualImageGenerateRouteDependencies = {
  canEditCategory,
  createAssetId: () => randomUUID(),
  createRequestId: () => randomUUID(),
  createOrUpdateStudioMediaAsset,
  generateCodexLocalImages,
  getCategoryAccessScope,
  getPublishCategoryMetadata,
  logInfo: (message) => console.info(message),
  readJsonBody,
  requireAuthenticatedSessionUser,
  requireSessionUser,
  resolveCodexAccessTokenFromRequest,
  resolveStudioMediaAssetUrls,
  toForbiddenApiResponse,
  toStudioFailureResponse,
  toUnauthorizedApiResponse,
  uploadSupabaseStorageFile,
};

function normalizeWhitespace(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildManualImageProjectSeed(publishCategory: PublishCategory, slides: PreparedSlide[]): string {
  const slideParts = slides.map((slide, slideIndex) =>
    [
      slideIndex,
      normalizeWhitespace(slide.title),
      normalizeWhitespace(slide.text),
      Array.isArray(slide.lines) ? slide.lines.map((line) => normalizeWhitespace(line)).filter(Boolean).join(" | ") : "",
    ].join("::")
  );
  return [publishCategory, ...slideParts].join("||");
}

function collectProjectCharacterIds(slides: PreparedSlide[]): string[] {
  const ids: string[] = [];
  for (const slide of slides) {
    const explicit = Array.isArray(slide.characterIds) ? slide.characterIds : [];
    const quoteIds = Array.isArray(slide.dialogueSegments)
      ? slide.dialogueSegments
          .filter((segment) => segment?.type === "quote" && String(segment.speakerId || "").trim())
          .map((segment) => String(segment.speakerId || "").trim())
      : [];
    for (const rawCharacterId of [...explicit, ...quoteIds]) {
      const characterId = String(rawCharacterId || "").trim();
      if (!characterId || ids.includes(characterId)) continue;
      ids.push(characterId);
    }
  }
  return ids;
}

function collectSlidesForCharacterAnchorScope(input: {
  slides: PreparedSlide[];
  mode: ManualImageGenerateMode;
  slideIndexes: number[];
  representativeIndexes: number[];
}): PreparedSlide[] {
  if (input.mode === "all") return input.slides;

  const scopedIndexes = new Set<number>();
  for (const representativeIndex of input.representativeIndexes) {
    for (const linkedIndex of getLinkedSlideIndexes(input.slides, representativeIndex)) {
      scopedIndexes.add(linkedIndex);
    }
  }
  if (input.mode === "selected") {
    for (const selectedIndex of input.slideIndexes) {
      scopedIndexes.add(selectedIndex);
    }
  }

  return Array.from(scopedIndexes)
    .sort((left, right) => left - right)
    .map((index) => input.slides[index])
    .filter((slide): slide is PreparedSlide => Boolean(slide));
}

function uniqueNumericIndexes(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<number>();
  for (const item of value) {
    const numeric = Number(item);
    if (!Number.isFinite(numeric)) continue;
    const normalized = Math.floor(numeric);
    if (normalized < 0 || normalized >= max) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped).sort((left, right) => left - right);
}

function parseManualImageGenerateRequest(body: unknown): ManualImageGenerateRequestPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("요청 본문이 올바르지 않습니다.");
  }
  const row = body as Record<string, unknown>;
  const slides = Array.isArray(row.slides) ? (row.slides as PreparedSlide[]) : [];
  const publishCategory = normalizeWhitespace(row.publishCategory) || "default";
  const mode = normalizeWhitespace(row.mode).toLowerCase();
  const parsedMode: ManualImageGenerateMode = mode === "all" ? "all" : mode === "missing" ? "missing" : "selected";
  if (slides.length <= 0) {
    throw new Error("slides 배열이 필요합니다.");
  }
  if (slides.length > 80) {
    throw new Error("slides는 80개 이하로 줄여 주세요.");
  }
  if (row.imageSource !== "auto-ai-generate") {
    throw new Error("실제 이미지 생성은 AI 이미지(자동 생성) 모드에서만 사용할 수 있습니다.");
  }
  const oversizedPromptIndex = slides.findIndex((slide) => Array.from(String(slide?.manualImagePrompt?.finalPrompt || "")).length > 6000);
  if (oversizedPromptIndex >= 0) {
    throw new Error(`슬라이드 ${oversizedPromptIndex + 1} finalPrompt는 6000자 이하로 줄여 주세요.`);
  }
  const rawProjectProfileSnapshot = row.projectProfileSnapshot;
  const projectProfileSnapshot = parseStudioProjectProfileSnapshot(rawProjectProfileSnapshot, { expectedCategory: publishCategory });
  if (typeof rawProjectProfileSnapshot !== "undefined" && rawProjectProfileSnapshot !== null && !projectProfileSnapshot) {
    throw new Error("projectProfileSnapshot is invalid or does not match publishCategory");
  }
  return {
    publishCategory,
    imageSource: "auto-ai-generate",
    slides,
    slideIndexes: uniqueNumericIndexes(row.slideIndexes, slides.length),
    mode: parsedMode,
    codexModel: normalizeWhitespace(row.codexModel) || undefined,
    fixedCharacterProfileId: normalizeWhitespace(row.fixedCharacterProfileId) || undefined,
    imageStylePrompt: normalizeWhitespace(row.imageStylePrompt) || undefined,
    characterProfiles: normalizeStudioCharacterProfiles(row.characterProfiles),
    projectProfileSnapshot,
  };
}

function extractPublishCategoryForAuthorization(body: unknown): PublishCategory {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "default";
  return (normalizeWhitespace((body as Record<string, unknown>).publishCategory) || "default") as PublishCategory;
}

function getLinkedSlideIndexes(slides: PreparedSlide[], index: number): Set<number> {
  const target = slides[index];
  if (!target) return new Set<number>();
  const linked = new Set<number>([index]);
  const targetGroupId = typeof target.groupId === "number" && Number.isFinite(target.groupId) ? target.groupId : null;
  const targetImageVariantId = normalizeWhitespace(target.imageVariantId);
  if (targetGroupId !== null && targetImageVariantId) {
    for (let i = 0; i < slides.length; i += 1) {
      const row = slides[i];
      if (
        typeof row.groupId === "number" &&
        Number.isFinite(row.groupId) &&
        row.groupId === targetGroupId &&
        normalizeWhitespace(row.imageVariantId) === targetImageVariantId
      ) {
        linked.add(i);
      }
    }
    return linked;
  }
  if (targetGroupId !== null) {
    for (let i = 0; i < slides.length; i += 1) {
      const row = slides[i];
      if (typeof row.groupId === "number" && Number.isFinite(row.groupId) && row.groupId === targetGroupId) {
        linked.add(i);
      }
    }
    return linked;
  }

  const targetTitle = normalizeWhitespace(target.title);
  const targetLayout = normalizeWhitespace(target.layout);
  const targetQuery = normalizeWhitespace(target.imageRequest?.query);
  if (!targetTitle && !targetQuery) return linked;

  for (let i = 0; i < slides.length; i += 1) {
    if (i === index) continue;
    const row = slides[i];
    const sameTitle = normalizeWhitespace(row.title) === targetTitle;
    const sameLayout = normalizeWhitespace(row.layout) === targetLayout;
    const sameQuery = normalizeWhitespace(row.imageRequest?.query) === targetQuery;
    if (sameLayout && (sameTitle || (targetQuery && sameQuery))) {
      linked.add(i);
    }
  }
  return linked;
}

function resolveRepresentativeSlideIndexes(input: {
  slides: PreparedSlide[];
  mode: ManualImageGenerateMode;
  slideIndexes: number[];
}): number[] {
  const seenKeys = new Set<string>();
  const candidates =
    input.mode === "selected"
      ? input.slideIndexes
      : input.slides.map((_, index) => index);
  const targets: number[] = [];

  for (const index of candidates) {
    const linkedIndexes = Array.from(getLinkedSlideIndexes(input.slides, index)).sort((left, right) => left - right);
    if (linkedIndexes.length <= 0) continue;
    const groupKey = linkedIndexes.join(",");
    if (seenKeys.has(groupKey)) continue;
    seenKeys.add(groupKey);
    const representativeIndex = linkedIndexes[0] ?? index;
    if (input.mode === "missing") {
      const groupHasImage = linkedIndexes.some((slideIndex) => {
        const slide = input.slides[slideIndex];
        return Boolean(normalizeWhitespace(slide?.imageUrl) || normalizeWhitespace(slide?.mediaUrl));
      });
      if (groupHasImage) continue;
    }
    targets.push(representativeIndex);
  }

  return targets;
}

function ensureManualPromptForSlide(input: {
  slides: PreparedSlide[];
  slideIndex: number;
  publishCategory: PublishCategory;
  metadata: Awaited<ReturnType<typeof getPublishCategoryMetadata>> | null;
  imageStylePrompt?: string;
  characterProfiles?: StoryCharacterProfile[];
  forceRefresh?: boolean;
}): PreparedSlide["manualImagePrompt"] {
  const slide = input.slides[input.slideIndex];
  if (!slide) return undefined;
  if (slide.manualImagePrompt?.finalPrompt) {
    const existingPrompt = slide.manualImagePrompt;
    const refreshedPrompt = buildStudioManualImagePrompt({
      slide,
      slideIndex: input.slideIndex,
      totalSlides: Math.max(1, input.slides.length),
      publishCategory: input.publishCategory,
      metadata: input.metadata,
      characterProfiles: input.characterProfiles,
      availableCharacterIds: collectProjectCharacterIds(input.slides),
      imageStylePrompt: input.imageStylePrompt,
      preferStyleOnlyBasePrompt: true,
      projectSeed: buildManualImageProjectSeed(input.publishCategory, input.slides),
      source: existingPrompt.source,
      scenePromptOverride: existingPrompt.scenePrompt,
      emotion: existingPrompt.emotion,
      action: existingPrompt.action,
      background: existingPrompt.background,
      props: existingPrompt.props,
      composition: existingPrompt.composition,
      warning: existingPrompt.warning,
      plannerModel: existingPrompt.plannerModel,
    });
    if (input.forceRefresh || shouldRefreshManualPromptAnchors(existingPrompt, refreshedPrompt, input.characterProfiles)) {
      return refreshedPrompt;
    }
    return existingPrompt;
  }
  return buildStudioManualImagePrompt({
    slide,
    slideIndex: input.slideIndex,
    totalSlides: Math.max(1, input.slides.length),
    publishCategory: input.publishCategory,
    metadata: input.metadata,
    characterProfiles: input.characterProfiles,
    availableCharacterIds: collectProjectCharacterIds(input.slides),
    imageStylePrompt: input.imageStylePrompt,
    preferStyleOnlyBasePrompt: true,
    projectSeed: buildManualImageProjectSeed(input.publishCategory, input.slides),
    source: "fallback",
  });
}

function shouldRefreshManualPromptAnchors(
  existingPrompt: NonNullable<PreparedSlide["manualImagePrompt"]>,
  refreshedPrompt: NonNullable<PreparedSlide["manualImagePrompt"]>,
  characterProfiles?: StoryCharacterProfile[]
): boolean {
  const existingAnchorImageUrl = normalizeWhitespace(existingPrompt.anchorImageUrl);
  const refreshedAnchorImageUrl = normalizeWhitespace(refreshedPrompt.anchorImageUrl);
  if (refreshedAnchorImageUrl && refreshedAnchorImageUrl !== existingAnchorImageUrl) return true;

  const existingAnchorAssetId = normalizeWhitespace(existingPrompt.anchorAssetId);
  const refreshedAnchorAssetId = normalizeWhitespace(refreshedPrompt.anchorAssetId);
  if (refreshedAnchorAssetId && refreshedAnchorAssetId !== existingAnchorAssetId) return true;

  const existingPromptText = `${existingPrompt.basePrompt || ""}\n${existingPrompt.finalPrompt || ""}`;
  const refreshedPromptText = `${refreshedPrompt.basePrompt || ""}\n${refreshedPrompt.finalPrompt || ""}`;
  const anchorReferences = Array.from(
    new Set(
      (characterProfiles || [])
        .flatMap((profile) => [profile.anchorImageUrl, profile.anchorAssetId])
        .map((value) => normalizeWhitespace(value))
        .filter(Boolean)
    )
  );

  return anchorReferences.some((reference) => refreshedPromptText.includes(reference) && !existingPromptText.includes(reference));
}

function buildCharacterAnchorPrompt(input: {
  profile: StoryCharacterProfile;
  publishCategory: PublishCategory;
  imageStylePrompt?: string;
}): string {
  const displayName = normalizeWhitespace(input.profile.displayName) || input.profile.characterId;
  const identityPrompt = normalizeWhitespace(input.profile.identityPrompt) || "반복 등장하는 핵심 인물, 기억하기 쉬운 얼굴 비율, 헤어 실루엣, 의상 색상";
  const stylePrompt = normalizeWhitespace(input.imageStylePrompt);
  return [
    stylePrompt ? `프로젝트 공통 스타일 기준: ${stylePrompt}.` : "",
    `캐릭터 기준 이미지 생성: ${displayName}.`,
    `고정 외형 설명: ${identityPrompt}.`,
    `목적: 이후 ${input.publishCategory || "default"} 쇼츠 전체에서 같은 인물로 유지할 기준 이미지.`,
    "구도: 캐릭터 1명만, 정면 또는 3/4 상반신, 얼굴과 핵심 의상/소품이 분명하게 보이는 단순한 배경.",
    AI_IMAGE_OUTPUT_CONSTRAINTS,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractCharacterIdentityFromManualPrompt(prompt: PreparedSlide["manualImagePrompt"], characterId: string): string {
  const basePrompt = normalizeWhitespace(prompt?.basePrompt);
  const escapedId = characterId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matched = basePrompt.match(new RegExp(`\\[${escapedId}\\]\\s*[^:：]*[:：]\\s*([^。\\.]+)`, "u"));
  return normalizeWhitespace(matched?.[1] || "");
}

function slideHasRenderableVisual(slide: PreparedSlide | undefined): boolean {
  if (!slide) return false;
  if (
    normalizeWhitespace(slide.imageUrl) ||
    normalizeWhitespace(slide.resolvedImageUrl) ||
    normalizeWhitespace(slide.mediaUrl)
  ) {
    return true;
  }
  return (slide.imageBeats || []).some((beat) =>
    Boolean(
      normalizeWhitespace(beat?.imageUrl) ||
        normalizeWhitespace(beat?.resolvedImageUrl) ||
        normalizeWhitespace(beat?.mediaUrl)
    )
  );
}

function addGeneratedAssetCandidateToSlides(input: {
  slides: PreparedSlide[];
  index: number;
  asset: {
    assetId?: string;
    imageUrl: string;
    mediaUrl?: string;
    mediaKind?: PreparedSlide["mediaKind"];
    title?: string;
  };
}): PreparedSlide[] {
  const candidate = buildStudioLibraryImageCandidate(input.asset);
  if (!candidate) return input.slides;
  const linkedIndexes = getLinkedSlideIndexes(input.slides, input.index);
  const groupHasImage = Array.from(linkedIndexes).some((slideIndex) =>
    slideHasRenderableVisual(input.slides[slideIndex])
  );
  if (!groupHasImage) {
    return applyStudioImageCandidateToSlides({
      slides: input.slides,
      index: input.index,
      getLinkedSlideIndexes,
      candidate,
      selectionReason: `${STUDIO_AUTO_APPLIED_SELECTION_REASON}: library${candidate.title ? ` / ${candidate.title}` : ""}`,
    });
  }
  return addStudioImageCandidateToSlides({
    slides: input.slides,
    index: input.index,
    getLinkedSlideIndexes,
    candidate,
  });
}

function createSlideWarning(slideIndex: number, message: string): string {
  return `슬라이드 ${slideIndex + 1}: ${message}`;
}

function toImageGenerationFolderPath(publishCategory: PublishCategory): string {
  return normalizeStudioMediaFolderPath(`ai-generated/${publishCategory || "default"}/codex-local`);
}

function toCharacterAnchorFolderPath(publishCategory: PublishCategory): string {
  return normalizeStudioMediaFolderPath(`ai-generated/${publishCategory || "default"}/character-anchors`);
}

async function persistGeneratedAsset(
  input: {
    assetId: string;
    publishCategory: PublishCategory;
    slide: PreparedSlide;
    slideIndex: number;
    generated: Extract<CodexLocalGeneratedImageResult, { status: "ok" }>;
    manualPrompt?: PreparedSlide["manualImagePrompt"];
    userId: string;
    folderPath?: string;
    titleOverride?: string;
    tags?: string[];
  },
  deps: ManualImageGenerateRouteDependencies
): Promise<{
  assetId?: string;
  imageUrl: string;
  mediaUrl?: string;
  mediaKind?: PreparedSlide["mediaKind"];
  title: string;
}> {
  const title =
    normalizeWhitespace(input.titleOverride) ||
    normalizeWhitespace(input.slide.title) ||
    normalizeWhitespace(input.slide.text) ||
    `슬라이드 ${input.slideIndex + 1} Codex 생성 이미지`;
  const summary = normalizeWhitespace(input.manualPrompt?.scenePrompt) || undefined;
  const folderPath = input.folderPath || toImageGenerationFolderPath(input.publishCategory);
  const storagePath = buildStudioMediaStorageObjectKey({
    scope: getSharedStudioLibraryScope(),
    folderPath,
    title,
    id: input.assetId,
    ext: input.generated.fileExtension,
  });
  const stored = await deps
    .uploadSupabaseStorageFile({
      path: storagePath,
      file: new Blob([new Uint8Array(input.generated.fileBuffer)], { type: input.generated.contentType }),
      contentType: input.generated.contentType,
    })
    .catch((error) => {
      throw new ManualImageGenerateAssetPersistenceError(
        "upload_failed",
        normalizeWhitespace(error instanceof Error ? error.message : String(error)) || "스토리지 업로드에 실패했습니다."
      );
    });

  const item = await deps
    .createOrUpdateStudioMediaAsset({
      userId: input.userId,
      provider: "codex-local",
      providerAssetId: input.assetId,
      title,
      summary,
      mediaKind: "image",
      sourceUrl: stored.publicUrl,
      storageUrl: stored.publicUrl,
      tags: [...(input.tags || ["codex-generated"]), input.publishCategory].filter(Boolean),
      emotionTags: [normalizeWhitespace(input.manualPrompt?.emotion)].filter(Boolean),
      queryHints: [
        normalizeWhitespace(input.slide.imageRequest?.query),
        normalizeWhitespace(input.manualPrompt?.mascotName),
        normalizeWhitespace(input.slide.title),
      ].filter(Boolean),
      folderPath,
      metadataOrigin: "manual",
    })
    .catch((error) => {
      throw new ManualImageGenerateAssetPersistenceError(
        "asset_store_failed",
        normalizeWhitespace(error instanceof Error ? error.message : String(error)) || "생성 자산 DB 저장에 실패했습니다."
      );
    });
  const urls = deps.resolveStudioMediaAssetUrls(item);
  return {
    assetId: item.id,
    imageUrl: urls.imageUrl || stored.publicUrl,
    mediaUrl: urls.mediaUrl,
    mediaKind: item.mediaKind,
    title: item.title || title,
  };
}

async function generateMissingCharacterAnchors(
  input: {
    requestId: string;
    publishCategory: PublishCategory;
    slides: PreparedSlide[];
    metadata: Awaited<ReturnType<typeof getPublishCategoryMetadata>> | null;
    imageStylePrompt?: string;
    codexModel?: string;
    userId: string;
    existingProfiles: StoryCharacterProfile[];
    maxGeneratedAnchors: number;
  },
  deps: ManualImageGenerateRouteDependencies
): Promise<{ characterProfiles: StoryCharacterProfile[]; warnings: string[] }> {
  const characterIds = collectProjectCharacterIds(input.slides);
  if (characterIds.length <= 0) {
    return { characterProfiles: input.existingProfiles, warnings: [] };
  }

  const seed = buildManualImageProjectSeed(input.publishCategory, input.slides);
  const profilesById = new Map(input.existingProfiles.map((profile) => [profile.characterId, profile]));
  const resolvedProfiles = characterIds.map((characterId) => {
    const existing = profilesById.get(characterId);
    if (existing?.anchorImageUrl) return existing;
    const probeSlide: PreparedSlide = {
      title: characterId,
      text: characterId,
      lines: [characterId],
      layout: "photo+body",
      characterIds: [characterId],
    };
    const prompt = buildStudioManualImagePrompt({
      slide: probeSlide,
      slideIndex: 0,
      totalSlides: 1,
      publishCategory: input.publishCategory,
      metadata: input.metadata,
      characterProfiles: input.existingProfiles,
      availableCharacterIds: characterIds,
      imageStylePrompt: input.imageStylePrompt,
      projectSeed: seed,
      source: "fallback",
    });
    return {
      characterId,
      displayName: existing?.displayName || prompt.characterNames?.[0] || characterId,
      identityPrompt:
        existing?.identityPrompt ||
        extractCharacterIdentityFromManualPrompt(prompt, characterId) ||
        "반복 등장하는 핵심 인물, 기억하기 쉬운 얼굴 비율, 헤어 실루엣, 의상 색상",
      anchorImageUrl: existing?.anchorImageUrl,
      anchorAssetId: existing?.anchorAssetId,
    } satisfies StoryCharacterProfile;
  });

  const missingProfiles = resolvedProfiles.filter((profile) => !profile.anchorImageUrl);
  if (missingProfiles.length <= 0) {
    return { characterProfiles: resolvedProfiles, warnings: [] };
  }
  if (missingProfiles.length > input.maxGeneratedAnchors) {
    throw new Error(
      `한 번에 생성할 이미지가 ${MAX_MANUAL_IMAGE_GENERATIONS_PER_REQUEST}개를 넘습니다. 슬라이드나 새 캐릭터 수를 줄여 주세요.`
    );
  }

  const anchorRequestId = `${input.requestId}-anchors`;
  const generation = await deps.generateCodexLocalImages(
    {
      requestId: anchorRequestId,
      items: missingProfiles.map((profile, index) => ({
        slideIndex: index,
        prompt: buildCharacterAnchorPrompt({
          profile,
          publishCategory: input.publishCategory,
          imageStylePrompt: input.imageStylePrompt,
        }),
        codexModel: input.codexModel,
      })),
    },
    {
      randomId: () => anchorRequestId,
    }
  );

  const warnings: string[] = [];
  const nextProfilesById = new Map(resolvedProfiles.map((profile) => [profile.characterId, profile]));
  for (const generated of generation.results) {
    const profile = missingProfiles[generated.slideIndex];
    if (!profile) continue;
    warnings.push(...generated.warnings);
    if (generated.status === "error") {
      warnings.push(`캐릭터 ${profile.characterId}: 기준 이미지 생성 실패 - ${generated.reason}`);
      continue;
    }
    try {
      const assetId = deps.createAssetId();
      const persisted = await persistGeneratedAsset(
        {
          assetId,
          publishCategory: input.publishCategory,
          slide: {
            title: `${profile.displayName || profile.characterId} 기준 이미지`,
            text: profile.identityPrompt || profile.characterId,
            lines: [profile.identityPrompt || profile.characterId],
            layout: "photo+body",
          },
          slideIndex: generated.slideIndex,
          generated,
          userId: input.userId,
          folderPath: toCharacterAnchorFolderPath(input.publishCategory),
          titleOverride: `${profile.displayName || profile.characterId} 기준 이미지`,
          tags: ["codex-generated", "character-anchor", profile.characterId],
        },
        deps
      );
      nextProfilesById.set(profile.characterId, {
        ...profile,
        anchorImageUrl: persisted.imageUrl,
        anchorAssetId: persisted.assetId,
      });
    } catch (error) {
      const message = normalizeWhitespace(error instanceof Error ? error.message : String(error)) || "기준 이미지 저장 실패";
      warnings.push(`캐릭터 ${profile.characterId}: 기준 이미지 저장 실패 - ${message}`);
    }
  }

  return {
    characterProfiles: [
      ...(characterIds.map((characterId) => nextProfilesById.get(characterId)).filter(Boolean) as StoryCharacterProfile[]),
      ...input.existingProfiles.filter((profile) => !characterIds.includes(profile.characterId)),
    ],
    warnings,
  };
}

export async function handleManualImageGeneratePost(
  request: NextRequest,
  deps: ManualImageGenerateRouteDependencies = defaultManualImageGenerateRouteDependencies
) {
  const user = deps.requireSessionUser(request);
  if (!user) return deps.toUnauthorizedApiResponse();
  const authUser = deps.requireAuthenticatedSessionUser(request) || user;

  try {
    const body = await deps.readJsonBody(request);
    const publishCategory = extractPublishCategoryForAuthorization(body);
    const scope = await deps.getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!deps.canEditCategory(scope, publishCategory)) {
      return deps.toForbiddenApiResponse("편집 권한이 있는 고객(category)만 제작할 수 있습니다.");
    }
    const payload = parseManualImageGenerateRequest(body);

    const requestId = deps.createRequestId();
    const representativeIndexes = resolveRepresentativeSlideIndexes({
      slides: payload.slides,
      mode: payload.mode,
      slideIndexes: payload.slideIndexes,
    });
    if (representativeIndexes.length > MAX_MANUAL_IMAGE_GENERATIONS_PER_REQUEST) {
      throw new Error(
        `한 번에 생성할 이미지는 ${MAX_MANUAL_IMAGE_GENERATIONS_PER_REQUEST}개 이하로 선택해 주세요.`
      );
    }
    if (representativeIndexes.length <= 0) {
      const responsePayload = {
        ok: true,
        requestId,
        slides: payload.slides,
        warnings: ["Codex 생성 대상 슬라이드가 없습니다."],
        results: [],
      } satisfies ManualImageGenerateResponse;
      return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(responsePayload, request));
    }

    const requestedFixedCharacterProfileId = String(payload.fixedCharacterProfileId || "").trim();
    const snapshotMetadata = payload.projectProfileSnapshot?.contentProfile.metadataSnapshot || null;
    const latestMetadata =
      requestedFixedCharacterProfileId || !snapshotMetadata
        ? await deps.getPublishCategoryMetadata(user.id, payload.publishCategory).catch(() => null)
        : null;
    const metadata = requestedFixedCharacterProfileId
      ? latestMetadata || snapshotMetadata
      : snapshotMetadata || latestMetadata;
    const selectedFixedCharacterProfile = resolveStudioCharacterProfileById(
      metadata?.fixedCharacterProfiles,
      requestedFixedCharacterProfileId
    );
    const promptMetadata = withoutAutomaticImageProfileFields(metadata);
    const promptSlides = selectedFixedCharacterProfile
      ? payload.slides.map((slide) => ({
          ...slide,
          characterIds: [selectedFixedCharacterProfile.characterId],
        }))
      : payload.slides;
    const scopedSlides = collectSlidesForCharacterAnchorScope({
      slides: promptSlides,
      mode: payload.mode,
      slideIndexes: payload.slideIndexes,
      representativeIndexes,
    });
    const anchorPreparation = selectedFixedCharacterProfile
      ? {
          characterProfiles: [selectedFixedCharacterProfile],
          warnings: [] as string[],
        }
      : await generateMissingCharacterAnchors(
          {
            requestId,
            publishCategory: payload.publishCategory,
            slides: scopedSlides,
            metadata: promptMetadata,
            imageStylePrompt: payload.imageStylePrompt,
            codexModel: payload.codexModel,
            userId: user.id,
            existingProfiles: payload.characterProfiles || [],
            maxGeneratedAnchors:
              MAX_MANUAL_IMAGE_GENERATIONS_PER_REQUEST - representativeIndexes.length,
          },
          deps
        );
    const slidesWithPrompts = payload.slides.map((slide, slideIndex) => {
      const manualImagePrompt = ensureManualPromptForSlide({
        slides: promptSlides,
        slideIndex,
        publishCategory: payload.publishCategory,
        metadata: promptMetadata,
        imageStylePrompt: selectedFixedCharacterProfile
          ? undefined
          : payload.imageStylePrompt,
        characterProfiles: anchorPreparation.characterProfiles,
        forceRefresh: Boolean(selectedFixedCharacterProfile),
      });
      return manualImagePrompt ? { ...slide, manualImagePrompt } : slide;
    });
    const generation = await deps.generateCodexLocalImages(
      {
        requestId,
        items: representativeIndexes.map((slideIndex) => ({
          slideIndex,
          prompt: slidesWithPrompts[slideIndex]?.manualImagePrompt?.finalPrompt || "",
          anchorImageUrl: slidesWithPrompts[slideIndex]?.manualImagePrompt?.anchorImageUrl,
          codexModel: payload.codexModel,
        })),
      },
      {
        // Route-level auth is still useful for readiness checks even though the local CLI path itself does not need the token.
        randomId: () => requestId,
      }
    );

    const warnings: string[] = [
      ...(requestedFixedCharacterProfileId && !selectedFixedCharacterProfile
        ? ["선택한 고정 캐릭터가 현재 콘텐츠 프로필에 없어 선택 안 함으로 처리했습니다."]
        : []),
      ...anchorPreparation.warnings,
    ];
    const results: ManualImageGenerateSlideResult[] = [];
    let nextSlides = slidesWithPrompts;

    for (const generated of generation.results) {
      const linkedSlideIndexes = Array.from(getLinkedSlideIndexes(nextSlides, generated.slideIndex)).sort((left, right) => left - right);
      warnings.push(...generated.warnings);

      if (generated.status === "error") {
        warnings.push(createSlideWarning(generated.slideIndex, generated.reason));
        results.push({
          slideIndex: generated.slideIndex,
          linkedSlideIndexes,
          status: "error",
          code: generated.code,
          reason: generated.reason,
          detail: generated.detail,
          warnings: generated.warnings,
        });
        continue;
      }

      const slide = nextSlides[generated.slideIndex];
      if (!slide) {
        warnings.push(createSlideWarning(generated.slideIndex, "슬라이드를 찾을 수 없어 결과를 반영하지 못했습니다."));
        results.push({
          slideIndex: generated.slideIndex,
          linkedSlideIndexes,
          status: "error",
          code: "slide_missing",
          reason: "슬라이드를 찾을 수 없습니다.",
          warnings: generated.warnings,
        });
        continue;
      }

      const assetId = deps.createAssetId();
      try {
        const persisted = await persistGeneratedAsset(
          {
            assetId,
            publishCategory: payload.publishCategory,
            slide,
            slideIndex: generated.slideIndex,
            generated,
            manualPrompt: slide.manualImagePrompt,
            userId: user.id,
          },
          deps
        );
        nextSlides = addGeneratedAssetCandidateToSlides({
          slides: nextSlides,
          index: generated.slideIndex,
          asset: {
            assetId: persisted.assetId,
            imageUrl: persisted.imageUrl,
            mediaUrl: persisted.mediaUrl,
            mediaKind: persisted.mediaKind,
            title: persisted.title,
          },
        });
        results.push({
          slideIndex: generated.slideIndex,
          linkedSlideIndexes,
          status: "ok",
          assetId: persisted.assetId,
          imageUrl: persisted.imageUrl,
          warnings: generated.warnings,
        });
      } catch (error) {
        const reason = normalizeWhitespace(error instanceof Error ? error.message : String(error)) || "생성 이미지를 저장하지 못했습니다.";
        warnings.push(createSlideWarning(generated.slideIndex, reason));
        results.push({
          slideIndex: generated.slideIndex,
          linkedSlideIndexes,
          status: "error",
          code: error instanceof ManualImageGenerateAssetPersistenceError ? error.code : "asset_store_failed",
          reason,
          warnings: generated.warnings,
        });
      }
    }

    deps.logInfo(
      `[studio-manual-image-generate] request_id=${requestId} targets=${representativeIndexes.length} successes=${results.filter((item) => item.status === "ok").length}`
    );

    const responsePayload = {
      ok: true,
      requestId,
      slides: nextSlides,
      characterProfiles: selectedFixedCharacterProfile
        ? undefined
        : anchorPreparation.characterProfiles,
      warnings,
      results,
    } satisfies ManualImageGenerateResponse;
    return NextResponse.json(rebaseLocalStorageUrlsToRequestOrigin(responsePayload, request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return deps.toStudioFailureResponse(message, "INVALID_MANUAL_IMAGE_GENERATE_INPUT", "MANUAL_IMAGE_GENERATE_FAILED");
  }
}

export async function POST(request: NextRequest) {
  return handleManualImageGeneratePost(request);
}
