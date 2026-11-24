export type PublishPreflightIssueKey =
  | "video_missing"
  | "title_missing"
  | "channel_missing"
  | "channel_disconnected"
  | "category_missing"
  | "category_channel_missing"
  | "schedule_missing"
  | "schedule_invalid";

export type PublishPreflightIssue = {
  key: PublishPreflightIssueKey;
  message: string;
  actionLabel?: string;
  href?: string;
};

function addVideoMissingIssue(
  issues: PublishPreflightIssue[],
  input: { hasVideoAsset: boolean; message: string; actionLabel?: string; href?: string }
): void {
  if (input.hasVideoAsset) return;
  issues.push({
    key: "video_missing",
    message: input.message,
    actionLabel: input.actionLabel,
    href: input.href,
  });
}

function addTitleMissingIssue(
  issues: PublishPreflightIssue[],
  input: { hasTitle: boolean; message: string; actionLabel?: string; href?: string }
): void {
  if (input.hasTitle) return;
  issues.push({
    key: "title_missing",
    message: input.message,
    actionLabel: input.actionLabel,
    href: input.href,
  });
}

function addDisconnectedChannelIssue(issues: PublishPreflightIssue[], message: string, href: string): void {
  issues.push({
    key: "channel_disconnected",
    message,
    actionLabel: "유튜브 채널 연결",
    href,
  });
}

function addScheduleIssues(issues: PublishPreflightIssue[], requireSchedule: boolean, scheduledAt: string): void {
  if (!requireSchedule) return;
  if (!scheduledAt) {
    issues.push({
      key: "schedule_missing",
      message: "예약 시간을 입력해 주세요.",
    });
    return;
  }

  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
    issues.push({
      key: "schedule_invalid",
      message: "예약 시간은 현재보다 이후여야 합니다.",
    });
  }
}

export function toPreflightDetail(issues: PublishPreflightIssue[]): string {
  return issues.map((issue) => issue.key).join(",") || "ok";
}

export function getPublishFormPreflightIssues(input: {
  hasVideoAsset: boolean;
  hasTitle: boolean;
  hasEffectiveChannel: boolean;
  hasConnectedChannel: boolean;
  authUrl: string;
  requireSchedule: boolean;
  scheduledAt: string;
}): PublishPreflightIssue[] {
  const issues: PublishPreflightIssue[] = [];
  addVideoMissingIssue(issues, {
    hasVideoAsset: input.hasVideoAsset,
    message: "발행할 영상이 없습니다.",
    actionLabel: "제작 화면으로 이동",
    href: "/shorts-json-studio",
  });
  addTitleMissingIssue(issues, {
    hasTitle: input.hasTitle,
    message: "제목을 입력해 주세요.",
    actionLabel: "입력 섹션으로 이동",
    href: "#publish-title",
  });
  if (!input.hasEffectiveChannel) {
    issues.push({
      key: "channel_missing",
      message: "콘텐츠 프로필의 기본 채널 연결이 필요합니다.",
      actionLabel: "기본 채널 연결 설정",
      href: "/settings?tab=contentProfile",
    });
  } else if (!input.hasConnectedChannel) {
    addDisconnectedChannelIssue(issues, "선택한 기본 채널이 연결되어 있지 않습니다.", input.authUrl);
  }
  addScheduleIssues(issues, input.requireSchedule, input.scheduledAt);
  return issues;
}

export function getAssetDraftPreflightIssues(input: {
  hasVideoAsset: boolean;
  title: string;
  publishCategory: string;
  mappedChannelId: string;
  isMappedChannelConnected: boolean;
  requireSchedule: boolean;
  scheduledAt: string;
  authUrl?: string;
}): PublishPreflightIssue[] {
  const issues: PublishPreflightIssue[] = [];
  addVideoMissingIssue(issues, {
    hasVideoAsset: input.hasVideoAsset,
    message: "영상 URL이 없습니다.",
  });
  addTitleMissingIssue(issues, {
    hasTitle: Boolean(input.title.trim()),
    message: "제목을 입력해 주세요.",
  });
  if (!input.publishCategory.trim()) {
    issues.push({ key: "category_missing", message: "콘텐츠 프로필을 선택해 주세요." });
  } else if (!input.mappedChannelId) {
    issues.push({
      key: "category_channel_missing",
      message: "선택한 콘텐츠 프로필에 기본 채널이 연결되어 있지 않습니다. 설정에서 기본 채널을 연결해 주세요.",
      actionLabel: "기본 채널 연결 설정",
      href: "/settings?tab=contentProfile",
    });
  } else if (!input.isMappedChannelConnected) {
    addDisconnectedChannelIssue(
      issues,
      "콘텐츠 프로필의 기본 채널이 연결되어 있지 않습니다. 채널을 다시 연결해 주세요.",
      input.authUrl || "/api/auth/youtube/start?redirect=/assets"
    );
  }
  addScheduleIssues(issues, input.requireSchedule, input.scheduledAt);
  return issues;
}
