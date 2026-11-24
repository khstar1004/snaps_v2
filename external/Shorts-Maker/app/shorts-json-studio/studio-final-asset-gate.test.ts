import assert from "node:assert/strict";
import test from "node:test";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import {
  gateStudioPublishIssuesByFinalAsset,
  resolveStudioFinalAssetGate,
  resolveStudioUsableDraftVideoUrl,
} from "./studio-final-asset-gate";

test("resolveStudioUsableDraftVideoUrl hides stale or unconfirmed draft videos", () => {
  const base = {
    videoUrl: "/video/draft.mp4",
    imageApproved: true,
    draftIsCurrent: true,
  };

  assert.equal(resolveStudioUsableDraftVideoUrl(base), "/video/draft.mp4");
  assert.equal(resolveStudioUsableDraftVideoUrl({ ...base, imageApproved: false }), null);
  assert.equal(resolveStudioUsableDraftVideoUrl({ ...base, draftIsCurrent: false }), null);
  assert.equal(resolveStudioUsableDraftVideoUrl({ ...base, videoUrl: null }), null);
});

test("resolveStudioFinalAssetGate exposes only a current final with image confirmation", () => {
  const base = {
    uploadedVideoUrl: "/video/final.mp4",
    imageApproved: true,
    finalIsCurrent: true,
  };

  assert.deepEqual(resolveStudioFinalAssetGate(base), {
    hasUsableFinalAsset: true,
    usableUploadedVideoUrl: "/video/final.mp4",
  });
  assert.equal(resolveStudioFinalAssetGate({ ...base, imageApproved: false }).usableUploadedVideoUrl, null);
  assert.equal(resolveStudioFinalAssetGate({ ...base, finalIsCurrent: false }).usableUploadedVideoUrl, null);
  assert.equal(resolveStudioFinalAssetGate({ ...base, uploadedVideoUrl: null }).usableUploadedVideoUrl, null);
});

test("gateStudioPublishIssuesByFinalAsset adds one actionable video blocker for a stale stored final", () => {
  const channelIssue: PublishPreflightIssue = {
    key: "channel_missing",
    message: "채널이 없습니다.",
  };
  const gated = gateStudioPublishIssuesByFinalAsset([channelIssue], false);

  assert.deepEqual(gated, [
    {
      key: "video_missing",
      message: "이미지 확인을 마친 현재 입력의 최종 영상이 필요합니다.",
      actionLabel: "제작 단계 확인",
      href: "#studio-result",
    },
    channelIssue,
  ]);
  assert.strictEqual(gateStudioPublishIssuesByFinalAsset(gated, false), gated);
  assert.strictEqual(gateStudioPublishIssuesByFinalAsset([channelIssue], true)[0], channelIssue);
});
