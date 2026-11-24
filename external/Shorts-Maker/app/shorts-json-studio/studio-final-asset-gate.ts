import type { PublishPreflightIssue } from "@/lib/publish/preflight";

export type StudioFinalAssetGateInput = {
  uploadedVideoUrl: string | null;
  imageApproved: boolean;
  finalIsCurrent: boolean;
};

export function resolveStudioUsableDraftVideoUrl(input: {
  videoUrl: string | null;
  imageApproved: boolean;
  draftIsCurrent: boolean;
}): string | null {
  const videoUrl = typeof input.videoUrl === "string" ? input.videoUrl.trim() : "";
  return videoUrl && input.imageApproved && input.draftIsCurrent ? videoUrl : null;
}

export function resolveStudioFinalAssetGate(input: StudioFinalAssetGateInput): {
  hasUsableFinalAsset: boolean;
  usableUploadedVideoUrl: string | null;
} {
  const uploadedVideoUrl = typeof input.uploadedVideoUrl === "string" ? input.uploadedVideoUrl.trim() : "";
  const hasUsableFinalAsset = Boolean(
    uploadedVideoUrl && input.imageApproved && input.finalIsCurrent
  );
  return {
    hasUsableFinalAsset,
    usableUploadedVideoUrl: hasUsableFinalAsset ? uploadedVideoUrl : null,
  };
}

export function gateStudioPublishIssuesByFinalAsset(
  issues: PublishPreflightIssue[],
  hasUsableFinalAsset: boolean
): PublishPreflightIssue[] {
  if (hasUsableFinalAsset || issues.some((issue) => issue.key === "video_missing")) return issues;
  return [
    {
      key: "video_missing",
      message: "이미지 확인을 마친 현재 입력의 최종 영상이 필요합니다.",
      actionLabel: "제작 단계 확인",
      href: "#studio-result",
    },
    ...issues,
  ];
}
