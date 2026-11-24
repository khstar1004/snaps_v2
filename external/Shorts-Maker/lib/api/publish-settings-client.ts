import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishJobsResponse, WorkspacePermissionsSummary } from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";
import { requestApi } from "@/lib/ui/api-client";
import type { CharacterProfile } from "@/types/character-profile";

export type CategoryOption = {
  key: PublishCategory;
  label: string;
};

export type CategoriesResponse = {
  ok: boolean;
  categories?: CategoryOption[];
  workspacePermissions?: WorkspacePermissionsSummary;
  storageReady?: boolean;
  error?: string;
};

export type CategoryMetadataResponse = {
  ok: boolean;
  categoryMetadata?: Record<PublishCategory, PublishMetadata>;
  error?: string;
};

export type RepairCategoriesResponse = {
  ok: boolean;
  repaired?: { jobsUpdated: number; assetsUpdated: number };
  error?: string;
};

export type StudioVoiceOption = {
  id: string;
  label: string;
};

export type StudioVoicesResponse = {
  ok: boolean;
  voices?: StudioVoiceOption[];
  error?: string;
};

export async function fetchPublishJobs(): Promise<PublishJobsResponse> {
  return requestApi<PublishJobsResponse>("/api/publish/jobs", { cache: "no-store" }, "채널 정보를 불러오지 못했습니다.");
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return requestApi<CategoriesResponse>("/api/publish/categories", { cache: "no-store" }, "콘텐츠 프로필 목록을 불러오지 못했습니다.");
}

export async function fetchCategoryMetadataMap(input?: { templateId?: StudioTemplateId }): Promise<CategoryMetadataResponse> {
  const templateId = normalizeStudioTemplateId(input?.templateId);
  return requestApi<CategoryMetadataResponse>(
    `/api/publish/category-metadata?templateId=${encodeURIComponent(templateId)}`,
    { cache: "no-store" },
    "콘텐츠 프로필 프리셋을 불러오지 못했습니다."
  );
}

export async function fetchStudioVoices(): Promise<StudioVoicesResponse> {
  return requestApi<StudioVoicesResponse>("/api/studio/voices", { cache: "no-store" }, "음성 목록을 불러오지 못했습니다.");
}

export async function saveCategoryChannels(input: {
  categoryChannels: Partial<Record<PublishCategory, string>>;
}): Promise<{ ok: boolean; categoryChannels?: Partial<Record<PublishCategory, string>> }> {
  return requestApi<{ ok: boolean; categoryChannels?: Partial<Record<PublishCategory, string>> }>(
    "/api/publish/category-channels",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "콘텐츠 프로필 채널 연결 저장에 실패했습니다."
  );
}

export async function addCategory(category: PublishCategory): Promise<CategoriesResponse> {
  return requestApi<CategoriesResponse>(
    "/api/publish/categories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", category }),
    },
    "콘텐츠 프로필 추가에 실패했습니다."
  );
}

export async function renameCategory(currentCategory: PublishCategory, nextCategory: PublishCategory): Promise<CategoriesResponse> {
  return requestApi<CategoriesResponse>(
    "/api/publish/categories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", currentCategory, nextCategory }),
    },
    "콘텐츠 프로필 이름 변경에 실패했습니다."
  );
}

export async function deleteCategory(category: PublishCategory): Promise<CategoriesResponse> {
  return requestApi<CategoriesResponse>(
    "/api/publish/categories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", category }),
    },
    "콘텐츠 프로필 삭제에 실패했습니다."
  );
}

export async function repairCategories(): Promise<RepairCategoriesResponse> {
  return requestApi<RepairCategoriesResponse>(
    "/api/publish/repair-categories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    },
    "콘텐츠 프로필 일괄 정리에 실패했습니다."
  );
}

export async function saveCategoryMetadata(input: {
  category: PublishCategory;
  templateId?: StudioTemplateId;
  description: string;
  tags: string[];
  ttsVoiceId: string;
  bgmEnabled: boolean;
  bgmTrackId: string;
  mixPresetId: string;
  bgmVolume: number;
  playbackRate: number;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  templateNotes: string;
  topicToScriptPrompt: string;
  scriptToJsonPrompt: string;
  mascotPrompt?: string;
  mascotName?: string;
  mascotDescription?: string;
  mascotStyle?: string;
  mascotTone?: string;
  mascotNegativePrompt?: string;
  mascotAnchorImageUrl?: string;
  mascotAnchorAssetId?: string;
  fixedCharacterProfiles?: CharacterProfile[];
}): Promise<{ ok: boolean; metadata?: PublishMetadata }> {
  return requestApi<{ ok: boolean; metadata?: PublishMetadata }>(
    "/api/publish/category-metadata",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "콘텐츠 프로필 프리셋 저장에 실패했습니다."
  );
}

export async function saveFixedCharacterProfiles(input: {
  category: PublishCategory;
  fixedCharacterProfiles: CharacterProfile[];
  templateId?: StudioTemplateId;
}): Promise<{ ok: boolean; metadata?: PublishMetadata }> {
  return requestApi<{ ok: boolean; metadata?: PublishMetadata }>(
    "/api/publish/category-metadata",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: input.category,
        templateId: normalizeStudioTemplateId(input.templateId || "default"),
        fixedCharacterProfiles: input.fixedCharacterProfiles,
      }),
    },
    "고정 캐릭터 저장에 실패했습니다."
  );
}

export async function resetCategoryMetadata(
  category: PublishCategory,
  templateId: StudioTemplateId = "default"
): Promise<{ ok: boolean; metadata?: PublishMetadata }> {
  return requestApi<{ ok: boolean; metadata?: PublishMetadata }>(
    "/api/publish/category-metadata",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, templateId, reset: true }),
    },
    "콘텐츠 프로필 프리셋 초기화에 실패했습니다."
  );
}
