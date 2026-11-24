import type { PublishJobStatus } from "@/lib/publish/types";

const PUBLISH_JOB_STATUS_SET: Record<PublishJobStatus, true> = {
  pending: true,
  processing: true,
  published: true,
  failed: true,
  canceled: true,
};

const PUBLISH_JOB_STATUS_LABEL_MAP: Record<PublishJobStatus, string> = {
  pending: "예약 대기",
  processing: "처리 중",
  published: "발행 완료",
  failed: "실패",
  canceled: "취소",
};

export function isPublishJobStatus(value: string): value is PublishJobStatus {
  return Boolean(PUBLISH_JOB_STATUS_SET[value as PublishJobStatus]);
}

export function toPublishJobStatusLabel(value: string): string {
  return isPublishJobStatus(value) ? PUBLISH_JOB_STATUS_LABEL_MAP[value] : value;
}

export function isPendingPublishJob(value: string): boolean {
  return value === "pending";
}

export function canDeletePublishJob(value: string, attempts: number): boolean {
  return value === "canceled" || (value === "failed" && attempts >= 3);
}
