import type { PublishTrashResponse } from "@/lib/publish/client-types";
import { requestApi } from "@/lib/ui/api-client";

type TrashResourceType = "category" | "job" | "asset";

export async function fetchPublishTrash(): Promise<PublishTrashResponse> {
  return requestApi<PublishTrashResponse>("/api/publish/trash", { cache: "no-store" }, "휴지통 목록을 불러오지 못했습니다.");
}

export async function restorePublishTrashItem(input: {
  resourceType: TrashResourceType;
  category?: string;
  jobId?: string;
  assetId?: string;
}): Promise<{ ok: boolean }> {
  return requestApi<{ ok: boolean }>(
    "/api/publish/trash",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    "휴지통 복구에 실패했습니다."
  );
}
