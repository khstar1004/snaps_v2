import { NextRequest, NextResponse } from "next/server";
import { recordAuditLogSafely } from "@/lib/audit/server";
import { canEditCategory, filterCategoryMapByAccess, getCategoryAccessScope, isCategoryAccessible } from "@/lib/auth/category-permissions";
import { requireAuthenticatedSessionUser, requireSessionUser, toForbiddenApiResponse, toUnauthorizedApiResponse } from "@/lib/auth/api";
import { toApiErrorResponse } from "@/lib/publish/api-error";
import { appendCategoryVersionHistory } from "@/lib/publish/category-version-history";
import { normalizePublishPlaybackRate, type PublishMetadata } from "@/lib/publish/category-metadata";
import {
  hasStudioCharacterIdentity,
  normalizeStudioCharacterProfiles,
} from "@/lib/studio/character-profiles";
import {
  buildPublishCategoryMetadataMap,
  mergePublishCategoryMetadata,
  resolvePublishCategoryBgmVolumeUpdate,
} from "@/lib/publish/category-metadata-merge";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeCategory } from "@/lib/publish/categories";
import { normalizeStudioAudioMixPresetId, normalizeStudioBgmVolume } from "@/lib/studio/audio-mix-presets";
import { validateStudioPromptTemplate } from "@/lib/studio/prompt-templates";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";
import type { PublishCategoryTemplatePreset } from "@/types/publish-template-preset";
import { sanitizeStoredCategoryTemplatePreset } from "@/lib/publish/publish-store-cache";
import {
  getPublishCategoryMetadata,
  listGlobalPublishCategoryMetadata,
  listGlobalPublishCustomers,
  listPublishCategories,
  listPublishCategoryMetadata,
  resolvePublishCustomerOwnerUserId,
  setPublishCategoryMetadata,
} from "@/lib/publish/publish-store";

export const runtime = "nodejs";

function asCategory(value: string | null): PublishCategory | null {
  const normalized = normalizeCategory(value);
  return normalized || null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTemplateId(value: unknown): StudioTemplateId {
  return normalizeStudioTemplateId(value);
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(-24, Math.min(12, parsed));
}

function asPlaybackRate(value: unknown): number | undefined {
  if (value === null || typeof value === "undefined" || (typeof value === "string" && !value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return normalizePublishPlaybackRate(parsed);
}

function asTemplatePreset(value: unknown, templateId: StudioTemplateId): PublishCategoryTemplatePreset | null {
  return sanitizeStoredCategoryTemplatePreset(value, templateId);
}

export async function GET(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  const scope = await getCategoryAccessScope({
    actorRole: authUser.role === "admin" ? "admin" : "member",
    workspaceUserId: user.id,
  });
  const category = asCategory(request.nextUrl.searchParams.get("category"));
  const templateId = asTemplateId(request.nextUrl.searchParams.get("templateId"));
  if (category) {
    if (!isCategoryAccessible(scope, category)) {
      return toForbiddenApiResponse("허용된 고객(category)만 조회할 수 있습니다.");
    }
    const targetUserId =
      authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;
    const stored = await getPublishCategoryMetadata(targetUserId, category, templateId);
    return NextResponse.json({
      ok: true,
      category,
      templateId,
      metadata: mergePublishCategoryMetadata(category, stored, templateId),
      isCustom: Boolean(stored),
    });
  }

  const storedMap = authUser.role === "admin" ? await listGlobalPublishCategoryMetadata(templateId) : await listPublishCategoryMetadata(user.id, templateId);
  const categories =
    authUser.role === "admin" ? await listGlobalPublishCustomers() : await listPublishCategories(user.id);
  const merged = buildPublishCategoryMetadataMap({ categories, storedMap, templateId });
  return NextResponse.json({
    ok: true,
    templateId,
    categoryMetadata: filterCategoryMapByAccess(merged, scope),
    customCategoryMetadata: filterCategoryMapByAccess(storedMap, scope),
  });
}

export async function POST(request: NextRequest) {
  const user = requireSessionUser(request);
  if (!user) return toUnauthorizedApiResponse();
  const authUser = requireAuthenticatedSessionUser(request) || user;
  try {
    const body = (await request.json()) as {
      category?: unknown;
      templateId?: unknown;
      description?: unknown;
      tags?: unknown;
      ttsVoiceId?: unknown;
      bgmEnabled?: unknown;
      bgmTrackId?: unknown;
      mixPresetId?: unknown;
      bgmVolume?: unknown;
      playbackRate?: unknown;
      sfxEnabled?: unknown;
      sfxMasterGainDb?: unknown;
      templateNotes?: unknown;
      topicToScriptPrompt?: unknown;
      scriptToJsonPrompt?: unknown;
      templatePreset?: unknown;
      mascotPrompt?: unknown;
      mascotName?: unknown;
      mascotDescription?: unknown;
      mascotStyle?: unknown;
      mascotTone?: unknown;
      mascotNegativePrompt?: unknown;
      mascotAnchorImageUrl?: unknown;
      mascotAnchorAssetId?: unknown;
      fixedCharacterProfiles?: unknown;
      reset?: unknown;
    };
    const category = asCategory(asString(body.category));
    const templateId = asTemplateId(body.templateId);
    const scope = await getCategoryAccessScope({
      actorRole: authUser.role === "admin" ? "admin" : "member",
      workspaceUserId: user.id,
    });
    if (!category) {
      return toApiErrorResponse("유효한 고객 값이 필요합니다.", {
        status: 400,
        errorCode: "CATEGORY_INVALID",
        retryable: false,
      });
    }
    if (!canEditCategory(scope, category)) {
      return toForbiddenApiResponse("편집 권한이 있는 고객(category)만 수정할 수 있습니다.");
    }
    const targetUserId =
      authUser.role === "admin" ? (await resolvePublishCustomerOwnerUserId(category, user.id)) || user.id : user.id;

    const reset = Boolean(body.reset);
    if (reset) {
      await setPublishCategoryMetadata(targetUserId, category, null, templateId);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.metadata_reset",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객 메타데이터를 기본값으로 되돌렸습니다.`,
        metadata: {
          templateId,
        },
      });
    } else {
      const storedCurrent = await getPublishCategoryMetadata(targetUserId, category, templateId);
      const current = mergePublishCategoryMetadata(category, storedCurrent, templateId);
      const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
      const hasTags = Object.prototype.hasOwnProperty.call(body, "tags");
      const hasTtsVoiceId = Object.prototype.hasOwnProperty.call(body, "ttsVoiceId");
      const hasBgmEnabled = Object.prototype.hasOwnProperty.call(body, "bgmEnabled");
      const hasBgmTrackId = Object.prototype.hasOwnProperty.call(body, "bgmTrackId");
      const hasMixPresetId = Object.prototype.hasOwnProperty.call(body, "mixPresetId");
      const hasBgmVolume = Object.prototype.hasOwnProperty.call(body, "bgmVolume");
      const hasPlaybackRate = Object.prototype.hasOwnProperty.call(body, "playbackRate");
      const hasSfxEnabled = Object.prototype.hasOwnProperty.call(body, "sfxEnabled");
      const hasSfxMasterGainDb = Object.prototype.hasOwnProperty.call(body, "sfxMasterGainDb");
      const hasTemplateNotes = Object.prototype.hasOwnProperty.call(body, "templateNotes");
      const hasTopicToScriptPrompt = Object.prototype.hasOwnProperty.call(body, "topicToScriptPrompt");
      const hasScriptToJsonPrompt = Object.prototype.hasOwnProperty.call(body, "scriptToJsonPrompt");
      const hasTemplatePreset = Object.prototype.hasOwnProperty.call(body, "templatePreset");
      const hasMascotPrompt = Object.prototype.hasOwnProperty.call(body, "mascotPrompt");
      const hasMascotName = Object.prototype.hasOwnProperty.call(body, "mascotName");
      const hasMascotDescription = Object.prototype.hasOwnProperty.call(body, "mascotDescription");
      const hasMascotStyle = Object.prototype.hasOwnProperty.call(body, "mascotStyle");
      const hasMascotTone = Object.prototype.hasOwnProperty.call(body, "mascotTone");
      const hasMascotNegativePrompt = Object.prototype.hasOwnProperty.call(body, "mascotNegativePrompt");
      const hasMascotAnchorImageUrl = Object.prototype.hasOwnProperty.call(body, "mascotAnchorImageUrl");
      const hasMascotAnchorAssetId = Object.prototype.hasOwnProperty.call(body, "mascotAnchorAssetId");
      const hasFixedCharacterProfiles = Object.prototype.hasOwnProperty.call(body, "fixedCharacterProfiles");
      const requestedFixedCharacterProfiles = hasFixedCharacterProfiles
        ? normalizeStudioCharacterProfiles(body.fixedCharacterProfiles)
        : current.fixedCharacterProfiles;
      if (
        requestedFixedCharacterProfiles?.some((profile) => !hasStudioCharacterIdentity(profile))
      ) {
        return toApiErrorResponse("고정 캐릭터마다 외형 설명 또는 기준 이미지가 필요합니다.", {
          status: 400,
          errorCode: "FIXED_CHARACTER_IDENTITY_REQUIRED",
          retryable: false,
        });
      }
      const nextMixPresetId =
        hasMixPresetId && typeof body.mixPresetId === "string"
          ? normalizeStudioAudioMixPresetId(body.mixPresetId)
          : current.mixPresetId;

      const nextMetadata: PublishMetadata = {
        description: hasDescription ? asString(body.description) : current.description,
        tags: hasTags ? asTags(body.tags) : current.tags,
        ttsVoiceId: hasTtsVoiceId ? asString(body.ttsVoiceId) : current.ttsVoiceId,
        bgmEnabled: hasBgmEnabled && typeof body.bgmEnabled === "boolean" ? body.bgmEnabled : current.bgmEnabled,
        bgmTrackId: hasBgmTrackId ? asString(body.bgmTrackId) : current.bgmTrackId,
        mixPresetId: nextMixPresetId,
        bgmVolume: resolvePublishCategoryBgmVolumeUpdate({
          currentBgmVolume: current.bgmVolume ?? normalizeStudioBgmVolume(undefined, current.mixPresetId),
          hasBgmVolume,
          requestedBgmVolume: body.bgmVolume,
          hasMixPresetId,
          nextMixPresetId,
          storedHasExplicitBgmVolume: typeof storedCurrent?.bgmVolume === "number",
        }),
        playbackRate: hasPlaybackRate ? asPlaybackRate(body.playbackRate) ?? current.playbackRate : current.playbackRate,
        sfxEnabled: hasSfxEnabled && typeof body.sfxEnabled === "boolean" ? body.sfxEnabled : current.sfxEnabled,
        sfxMasterGainDb: hasSfxMasterGainDb ? asFiniteNumber(body.sfxMasterGainDb) ?? current.sfxMasterGainDb : current.sfxMasterGainDb,
        templateNotes: hasTemplateNotes ? asString(body.templateNotes) : current.templateNotes,
        topicToScriptPrompt: hasTopicToScriptPrompt ? asString(body.topicToScriptPrompt) : current.topicToScriptPrompt,
        scriptToJsonPrompt: hasScriptToJsonPrompt ? asString(body.scriptToJsonPrompt) : current.scriptToJsonPrompt,
        templatePreset: hasTemplatePreset ? asTemplatePreset(body.templatePreset, templateId) : current.templatePreset,
        mascotPrompt: hasMascotPrompt ? asString(body.mascotPrompt) || undefined : current.mascotPrompt,
        mascotName: hasMascotName ? asString(body.mascotName) || undefined : current.mascotName,
        mascotDescription: hasMascotDescription ? asString(body.mascotDescription) || undefined : current.mascotDescription,
        mascotStyle: hasMascotStyle ? asString(body.mascotStyle) || undefined : current.mascotStyle,
        mascotTone: hasMascotTone ? asString(body.mascotTone) || undefined : current.mascotTone,
        mascotNegativePrompt:
          hasMascotNegativePrompt ? asString(body.mascotNegativePrompt) || undefined : current.mascotNegativePrompt,
        mascotAnchorImageUrl:
          hasMascotAnchorImageUrl ? asString(body.mascotAnchorImageUrl) || undefined : current.mascotAnchorImageUrl,
        mascotAnchorAssetId:
          hasMascotAnchorAssetId ? asString(body.mascotAnchorAssetId) || undefined : current.mascotAnchorAssetId,
        fixedCharacterProfiles: requestedFixedCharacterProfiles,
      };

      if (!nextMetadata.description) {
        return toApiErrorResponse("설명 값이 필요합니다.", {
          status: 400,
          errorCode: "DESCRIPTION_REQUIRED",
          retryable: false,
        });
      }
      const topicPromptError = validateStudioPromptTemplate("topicToScriptPrompt", nextMetadata.topicToScriptPrompt);
      if (topicPromptError) {
        return toApiErrorResponse(`대본 생성 프롬프트 오류: ${topicPromptError}`, {
          status: 400,
          errorCode: "TOPIC_PROMPT_INVALID",
          retryable: false,
        });
      }
      const scriptPromptError = validateStudioPromptTemplate("scriptToJsonPrompt", nextMetadata.scriptToJsonPrompt);
      if (scriptPromptError) {
        return toApiErrorResponse(`JSON 변환 프롬프트 오류: ${scriptPromptError}`, {
          status: 400,
          errorCode: "SCRIPT_TO_JSON_PROMPT_INVALID",
          retryable: false,
        });
      }
      await setPublishCategoryMetadata(targetUserId, category, nextMetadata, templateId);
      await recordAuditLogSafely({
        user,
        request,
        action: "category.metadata_updated",
        resourceType: "category",
        resourceId: category,
        resourceLabel: category,
        detail: `${category} 고객 메타데이터를 수정했습니다.`,
        metadata: {
          templateId,
          hasTemplateNotes: Boolean(nextMetadata.templateNotes),
          hasTemplatePreset: Boolean(nextMetadata.templatePreset),
          hasMascotProfile: Boolean(
            nextMetadata.mascotPrompt ||
            nextMetadata.mascotName ||
              nextMetadata.mascotDescription ||
              nextMetadata.mascotStyle ||
              nextMetadata.mascotTone ||
              nextMetadata.mascotNegativePrompt ||
              nextMetadata.mascotAnchorImageUrl ||
              nextMetadata.mascotAnchorAssetId ||
              nextMetadata.fixedCharacterProfiles?.length
          ),
          fixedCharacterCount: nextMetadata.fixedCharacterProfiles?.length || 0,
          tagCount: nextMetadata.tags.length,
        },
      });
    }

    const stored = await getPublishCategoryMetadata(targetUserId, category, templateId);
    const mergedMetadata = mergePublishCategoryMetadata(category, stored, templateId);
    await appendCategoryVersionHistory({
      userId: targetUserId,
      category,
      section: "metadata",
      templateId,
      payload: mergedMetadata,
      createdBy: authUser.loginId || authUser.id,
    });
    return NextResponse.json({
      ok: true,
      category,
      templateId,
      metadata: mergedMetadata,
      isCustom: Boolean(stored),
    });
  } catch (e) {
    return toApiErrorResponse(e instanceof Error ? e.message : String(e), {
      status: 400,
      errorCode: "CATEGORY_METADATA_REQUEST_INVALID",
      retryable: false,
    });
  }
}
