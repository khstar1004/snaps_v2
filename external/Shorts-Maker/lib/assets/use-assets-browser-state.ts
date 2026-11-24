"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssetsPublishDraft } from "@/lib/assets/use-assets-drafts";
import { resolveAssetCategory } from "@/lib/assets/use-assets-drafts";
import type { AssetsLatestResponse, PublishAccountSummary, PublishJobSummary } from "@/lib/publish/client-types";
import { isPendingPublishJob } from "@/lib/publish/job-status";
import { buildJobsByVideoUrl } from "@/lib/publish/jobs-by-video-url";
import { getAssetDraftPreflightIssues } from "@/lib/publish/preflight";

export function useAssetsBrowserState(input: {
  items: AssetsLatestResponse["items"];
  jobs: PublishJobSummary[];
  categoryOptions: Array<{ key: string; label: string }>;
  selectedCategory: string;
  search: string;
  draftMap: Record<string, AssetsPublishDraft>;
  categoryChannels: Partial<Record<string, string>>;
  accounts: PublishAccountSummary[];
  initialVisibleCount: number;
  visibleStep: number;
}) {
  const [visibleCountByCategory, setVisibleCountByCategory] = useState<Record<string, number>>({});

  const jobsByVideoUrl = useMemo(() => buildJobsByVideoUrl(input.jobs), [input.jobs]);

  const filteredItems = useMemo(() => {
    const query = input.search.trim().toLowerCase();
    return input.items.filter((item) => {
      const latestJob = (jobsByVideoUrl.get(item.url) || [])[0];
      const categoryKey = resolveAssetCategory(item, latestJob);
      const categoryMatched = input.selectedCategory === "all" || input.selectedCategory === categoryKey;
      if (!categoryMatched) return false;
      if (!query) return true;
      return item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query);
    });
  }, [input.items, jobsByVideoUrl, input.selectedCategory, input.search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, AssetsLatestResponse["items"]>();
    for (const item of filteredItems) {
      const latestJob = (jobsByVideoUrl.get(item.url) || [])[0];
      const key = resolveAssetCategory(item, latestJob);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return Array.from(groups.entries());
  }, [filteredItems, jobsByVideoUrl]);

  useEffect(() => {
    setVisibleCountByCategory((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const [categoryKey] of groupedItems) {
        const current = prev[categoryKey];
        if (typeof current === "number" && Number.isFinite(current) && current > 0) {
          next[categoryKey] = current;
        } else {
          next[categoryKey] = input.initialVisibleCount;
          changed = true;
        }
      }
      const prevKeys = Object.keys(prev);
      if (!changed && prevKeys.length === Object.keys(next).length) {
        const same = prevKeys.every((key) => prev[key] === next[key]);
        if (same) return prev;
      }
      return next;
    });
  }, [groupedItems, input.initialVisibleCount]);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>(input.categoryOptions.map((item) => [item.key, item.label]));
    map.set("uncategorized", "미분류");
    return map;
  }, [input.categoryOptions]);

  const pendingJobCount = useMemo(() => input.jobs.filter((job) => isPendingPublishJob(job.status)).length, [input.jobs]);

  const preflightOverview = useMemo(() => {
    const issueCount = new Map<string, number>();
    let blockedPublish = 0;
    let blockedSchedule = 0;
    for (const item of filteredItems.slice(0, 20)) {
      const draft = input.draftMap[item.id];
      if (!draft) continue;
      const mappedChannelId = (input.categoryChannels[draft.publishCategory] || "").trim();
      const effectiveChannelId = (draft.channelId || mappedChannelId || "").trim();
      const connected = effectiveChannelId ? input.accounts.some((account) => account.channelId === effectiveChannelId) : false;
      const publishIssues = getAssetDraftPreflightIssues({
        hasVideoAsset: Boolean(item.url.trim()),
        title: draft.title,
        publishCategory: draft.publishCategory,
        mappedChannelId: effectiveChannelId,
        isMappedChannelConnected: connected,
        requireSchedule: false,
        scheduledAt: draft.scheduledAt,
        authUrl: "/api/auth/youtube/start?redirect=/assets",
      });
      const scheduleIssues = getAssetDraftPreflightIssues({
        hasVideoAsset: Boolean(item.url.trim()),
        title: draft.title,
        publishCategory: draft.publishCategory,
        mappedChannelId: effectiveChannelId,
        isMappedChannelConnected: connected,
        requireSchedule: true,
        scheduledAt: draft.scheduledAt,
        authUrl: "/api/auth/youtube/start?redirect=/assets",
      });
      if (publishIssues.length > 0) blockedPublish += 1;
      if (scheduleIssues.length > 0) blockedSchedule += 1;
      for (const issue of [...publishIssues, ...scheduleIssues]) {
        issueCount.set(issue.key, (issueCount.get(issue.key) || 0) + 1);
      }
    }
    const topIssue = Array.from(issueCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "ok";
    return { blockedPublish, blockedSchedule, topIssue };
  }, [input.accounts, input.categoryChannels, input.draftMap, filteredItems]);

  const loadMoreInCategory = (categoryKey: string) => {
    setVisibleCountByCategory((prev) => ({
      ...prev,
      [categoryKey]: (prev[categoryKey] || input.initialVisibleCount) + input.visibleStep,
    }));
  };

  return {
    jobsByVideoUrl,
    filteredItems,
    groupedItems,
    visibleCountByCategory,
    categoryLabelMap,
    pendingJobCount,
    preflightOverview,
    loadMoreInCategory,
  };
}
