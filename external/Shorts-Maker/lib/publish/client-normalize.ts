import type { AssetsLatestResponse, PublishJobsResponse } from "@/lib/publish/client-types";
import type { PublishCategory } from "@/lib/publish/types";

export type PublishJobsSnapshot = {
  accounts: NonNullable<PublishJobsResponse["accounts"]>;
  jobs: NonNullable<PublishJobsResponse["jobs"]>;
  categoryChannels: Partial<Record<PublishCategory, string>>;
};

export function normalizePublishJobsResponse(payload: PublishJobsResponse): PublishJobsSnapshot {
  return {
    accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
    jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
    categoryChannels: payload.categoryChannels || {},
  };
}

export function normalizeAssetsLatestResponse(payload: AssetsLatestResponse): AssetsLatestResponse {
  return {
    ok: payload.ok,
    latest: payload.latest || null,
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}
