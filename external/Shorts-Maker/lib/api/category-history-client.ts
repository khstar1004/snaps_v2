import { requestApi } from "@/lib/ui/api-client";
import type { PublishCategory } from "@/lib/publish/types";
import type { StudioTemplateId } from "@/types/studio-template";

export type CategoryHistoryEntry = {
  id: string;
  category: PublishCategory;
  section: "metadata" | "branding";
  templateId: StudioTemplateId | null;
  createdBy: string | null;
  createdAt: number;
  payload: Record<string, unknown>;
};

export type CategoryHistoryResponse = {
  ok: boolean;
  category?: PublishCategory;
  templateId?: StudioTemplateId;
  metadataHistory?: CategoryHistoryEntry[];
  brandingHistory?: CategoryHistoryEntry[];
};

export async function fetchCategoryHistory(input: {
  category: PublishCategory;
  templateId: StudioTemplateId;
}): Promise<CategoryHistoryResponse> {
  const params = new URLSearchParams();
  params.set("category", input.category);
  params.set("templateId", input.templateId);
  return requestApi<CategoryHistoryResponse>(
    `/api/publish/category-history?${params.toString()}`,
    { cache: "no-store" },
    "카테고리 버전 이력을 불러오지 못했습니다."
  );
}

export async function restoreCategoryHistoryVersion(input: {
  category: PublishCategory;
  section: "metadata" | "branding";
  versionId: string;
}): Promise<{ ok: boolean }> {
  return requestApi<{ ok: boolean }>(
    "/api/publish/category-history",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "카테고리 버전 복구에 실패했습니다."
  );
}
