import assert from "node:assert/strict";
import test from "node:test";
import { getAssetDraftPreflightIssues, getPublishFormPreflightIssues } from "./preflight";

test("publish form preflight routes missing channel setup to content profile settings", () => {
  const issues = getPublishFormPreflightIssues({
    hasVideoAsset: true,
    hasTitle: true,
    hasEffectiveChannel: false,
    hasConnectedChannel: false,
    authUrl: "/api/auth/youtube/start?redirect=/publish",
    requireSchedule: false,
    scheduledAt: "",
  });

  assert.deepEqual(issues, [
    {
      key: "channel_missing",
      message: "콘텐츠 프로필의 기본 채널 연결이 필요합니다.",
      actionLabel: "기본 채널 연결 설정",
      href: "/settings?tab=contentProfile",
    },
  ]);
});

test("asset draft preflight routes missing category channel mapping to content profile settings", () => {
  const issues = getAssetDraftPreflightIssues({
    hasVideoAsset: true,
    title: "발행 제목",
    publishCategory: "news",
    mappedChannelId: "",
    isMappedChannelConnected: false,
    requireSchedule: false,
    scheduledAt: "",
  });

  assert.deepEqual(issues, [
    {
      key: "category_channel_missing",
      message: "선택한 콘텐츠 프로필에 기본 채널이 연결되어 있지 않습니다. 설정에서 기본 채널을 연결해 주세요.",
      actionLabel: "기본 채널 연결 설정",
      href: "/settings?tab=contentProfile",
    },
  ]);
});
