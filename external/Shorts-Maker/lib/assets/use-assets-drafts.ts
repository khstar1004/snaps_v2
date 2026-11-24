"use client";

import { useEffect, useState } from "react";
import type { AssetsLatestResponse, PublishJobSummary } from "@/lib/publish/client-types";
import { buildJobsByVideoUrl } from "@/lib/publish/jobs-by-video-url";

export type AssetsPublishDraft = {
  title: string;
  description: string;
  tags: string;
  visibility: "private" | "public" | "unlisted";
  publishCategory: string;
  channelId: string;
  scheduledAt: string;
};

function toAssetCategoryKey(value?: string): string {
  const safe = (value || "").trim();
  return safe || "uncategorized";
}

export function resolveAssetCategory(asset: AssetsLatestResponse["items"][number], latestJob?: PublishJobSummary): string {
  return toAssetCategoryKey(asset.publishCategory || latestJob?.publishCategory);
}

export function useAssetsDrafts(input: {
  items: AssetsLatestResponse["items"];
  jobs: PublishJobSummary[];
  categoryChannels: Partial<Record<string, string>>;
  categoryOptions: Array<{ key: string }>;
  categoryMetadataMap: Record<string, { description: string; tags: string[] }>;
}) {
  const [draftMap, setDraftMap] = useState<Record<string, AssetsPublishDraft>>({});
  const jobsByVideoUrl = buildJobsByVideoUrl(input.jobs);

  useEffect(() => {
    if (input.items.length === 0) return;
    setDraftMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const asset of input.items) {
        if (next[asset.id]) continue;
        const latestJob = (jobsByVideoUrl.get(asset.url) || [])[0];
        const resolved = resolveAssetCategory(asset, latestJob);
        const category = resolved === "uncategorized" ? input.categoryOptions[0]?.key || "" : resolved;
        const metadata = input.categoryMetadataMap[category] || { description: "", tags: [] };
        next[asset.id] = {
          title: asset.title,
          description: metadata.description,
          tags: metadata.tags.join(", "),
          visibility: "public",
          publishCategory: category,
          channelId: input.categoryChannels[category] || "",
          scheduledAt: "",
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [input.items, jobsByVideoUrl, input.categoryChannels, input.categoryOptions, input.categoryMetadataMap]);

  return {
    draftMap,
    setDraftMap,
  };
}
