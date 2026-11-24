"use client";

import { useMemo } from "react";
import { getPublishFormPreflightIssues } from "@/lib/publish/preflight";
import { toCategoryLabel } from "@/lib/publish/categories";
import type { WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";
import {
  canEditWorkspaceCategory,
  canPublishWorkspaceCategory,
  getWorkspaceCategoryPermissionLevel,
  toWorkspacePermissionLevelLabel,
} from "@/lib/ui/workspace-permissions";
import type { PreparedSlide } from "@/types/studio-json";
import type { SpeakerVoiceEditorRow, StoryCharacterProfileEditorRow } from "./studio-page-helpers";
import type { StudioPreselectedMediaApplyMode, StudioPreselectedMediaItem } from "./types";

type PublishAccountLike = {
  channelId?: string;
  channelTitle?: string;
};

type CategoryOptionLike = {
  id?: string;
};

type PreselectedMediaAssignment = {
  itemId: string;
  slideIndex: number;
};

type UseStudioParsedPublishingStateInput = {
  applyPublishTitleToSlidesAction: (slides: PreparedSlide[], publishTitle: string) => PreparedSlide[];
  buildPreselectedMediaAssignmentsAction: (
    slideCount: number,
    items: StudioPreselectedMediaItem[],
    applyMode: StudioPreselectedMediaApplyMode
  ) => PreselectedMediaAssignment[];
  categoryChannels: Partial<Record<string, string>>;
  extractSpeakerVoiceRowsAction: (parsed: unknown) => SpeakerVoiceEditorRow[];
  extractStoryCharacterProfileRowsAction: (
    parsed: unknown,
    speakerRows: SpeakerVoiceEditorRow[]
  ) => StoryCharacterProfileEditorRow[];
  extractFixedCharacterProfileIdAction: (parsed: unknown) => string;
  extractImageStylePromptAction: (parsed: unknown) => string;
  getParsedSlideCountAction: (parsed: unknown) => number;
  getPreselectedMediaValidationMessageAction: (input: {
    slideCount: number;
    items: StudioPreselectedMediaItem[];
    applyMode: StudioPreselectedMediaApplyMode;
  }) => string;
  jsonText: string;
  preselectedMediaApplyMode: StudioPreselectedMediaApplyMode;
  preselectedMediaItems: StudioPreselectedMediaItem[];
  publishAccounts: PublishAccountLike[];
  publishCategory: PublishCategory;
  quickScheduledAt: string;
  slides: PreparedSlide[];
  uploadedVideoUrl: string | null;
  workspacePermissions: WorkspacePermissionsSummary | null;
};

export function useStudioParsedPublishingState(input: UseStudioParsedPublishingStateInput) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(input.jsonText) as unknown;
    } catch {
      return null;
    }
  }, [input.jsonText]);

  const speakerVoiceRows = useMemo(() => input.extractSpeakerVoiceRowsAction(parsed), [input, parsed]);
  const storyCharacterProfileRows = useMemo(
    () => input.extractStoryCharacterProfileRowsAction(parsed, speakerVoiceRows),
    [input, parsed, speakerVoiceRows]
  );
  const fixedCharacterProfileId = useMemo(
    () => input.extractFixedCharacterProfileIdAction(parsed),
    [input, parsed]
  );
  const imageStylePrompt = useMemo(() => input.extractImageStylePromptAction(parsed), [input, parsed]);
  const parsedSlideCount = useMemo(() => input.getParsedSlideCountAction(parsed), [input, parsed]);
  const preselectedMediaAssignments = useMemo(
    () => input.buildPreselectedMediaAssignmentsAction(parsedSlideCount, input.preselectedMediaItems, input.preselectedMediaApplyMode),
    [input, parsedSlideCount]
  );
  const preselectedMediaValidationMessage = useMemo(
    () =>
      input.getPreselectedMediaValidationMessageAction({
        slideCount: parsedSlideCount,
        items: input.preselectedMediaItems,
        applyMode: input.preselectedMediaApplyMode,
      }),
    [input, parsedSlideCount]
  );

  const mappedChannelId = input.categoryChannels[input.publishCategory] || "";
  const mappedChannelTitle = useMemo(() => {
    if (!mappedChannelId) return "";
    return input.publishAccounts.find((account) => account.channelId === mappedChannelId)?.channelTitle || "";
  }, [input.publishAccounts, mappedChannelId]);

  const selectedCategoryPermissionLevel = useMemo(
    () => getWorkspaceCategoryPermissionLevel(input.workspacePermissions, input.publishCategory),
    [input.publishCategory, input.workspacePermissions]
  );
  const selectedCategoryPermissionLabel = useMemo(
    () => toWorkspacePermissionLevelLabel(selectedCategoryPermissionLevel),
    [selectedCategoryPermissionLevel]
  );
  const canEditSelectedCategory = useMemo(
    () => canEditWorkspaceCategory(input.workspacePermissions, input.publishCategory),
    [input.publishCategory, input.workspacePermissions]
  );
  const canPublishSelectedCategory = useMemo(
    () => canPublishWorkspaceCategory(input.workspacePermissions, input.publishCategory),
    [input.publishCategory, input.workspacePermissions]
  );

  const studioEditPermissionMessage = useMemo(
    () => `${toCategoryLabel(input.publishCategory)} 고객은 현재 ${selectedCategoryPermissionLabel} 권한이라 제작 수정이 잠겨 있습니다.`,
    [input.publishCategory, selectedCategoryPermissionLabel]
  );
  const studioPublishPermissionMessage = useMemo(
    () => `${toCategoryLabel(input.publishCategory)} 고객은 현재 ${selectedCategoryPermissionLabel} 권한이라 발행 작업을 실행할 수 없습니다.`,
    [input.publishCategory, selectedCategoryPermissionLabel]
  );

  const hasUploadedAsset = Boolean(input.uploadedVideoUrl);
  const publishTitle = useMemo(
    () => String((parsed as Record<string, unknown> | null)?.title || input.slides[0]?.title || "자동 생성 쇼츠"),
    [parsed, input.slides]
  );
  const displaySlides = useMemo(() => input.applyPublishTitleToSlidesAction(input.slides, publishTitle), [input, publishTitle]);

  const studioHasConnectedChannel =
    Boolean(mappedChannelId) && input.publishAccounts.some((account) => account.channelId === mappedChannelId);
  const studioPublishPreflightIssues = useMemo(
    () =>
      getPublishFormPreflightIssues({
        hasVideoAsset: hasUploadedAsset,
        hasTitle: Boolean(publishTitle.trim()),
        hasEffectiveChannel: Boolean(mappedChannelId),
        hasConnectedChannel: studioHasConnectedChannel,
        authUrl: "/api/auth/youtube/start?redirect=/shorts-json-studio",
        requireSchedule: false,
        scheduledAt: input.quickScheduledAt,
      }),
    [hasUploadedAsset, mappedChannelId, publishTitle, input.quickScheduledAt, studioHasConnectedChannel]
  );
  const studioSchedulePreflightIssues = useMemo(
    () =>
      getPublishFormPreflightIssues({
        hasVideoAsset: hasUploadedAsset,
        hasTitle: Boolean(publishTitle.trim()),
        hasEffectiveChannel: Boolean(mappedChannelId),
        hasConnectedChannel: studioHasConnectedChannel,
        authUrl: "/api/auth/youtube/start?redirect=/shorts-json-studio",
        requireSchedule: true,
        scheduledAt: input.quickScheduledAt,
      }),
    [hasUploadedAsset, mappedChannelId, publishTitle, input.quickScheduledAt, studioHasConnectedChannel]
  );

  return {
    parsed,
    speakerVoiceRows,
    storyCharacterProfileRows,
    fixedCharacterProfileId,
    imageStylePrompt,
    parsedSlideCount,
    preselectedMediaAssignments,
    preselectedMediaValidationMessage,
    mappedChannelId,
    mappedChannelTitle,
    selectedCategoryPermissionLevel,
    selectedCategoryPermissionLabel,
    canEditSelectedCategory,
    canPublishSelectedCategory,
    studioEditPermissionMessage,
    studioPublishPermissionMessage,
    hasUploadedAsset,
    publishTitle,
    displaySlides,
    studioPublishPreflightIssues,
    studioSchedulePreflightIssues,
    studioPublishReady: studioPublishPreflightIssues.length === 0,
    studioScheduleReady: studioSchedulePreflightIssues.length === 0,
  };
}
