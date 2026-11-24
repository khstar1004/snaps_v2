import { canDeletePublishJob, isPendingPublishJob } from "@/lib/publish/job-status";

type JobLike = {
  id: string;
  status: string;
  attempts?: number;
  publishedUrl?: string | null;
};

export type AssetPrimaryAction =
  | { kind: "publish"; label: string; href: string }
  | { kind: "run-now" | "delete"; label: string; jobId: string };

export function toPublishFormHref(videoUrl: string, title: string): string {
  return `/publish?videoUrl=${encodeURIComponent(videoUrl)}&title=${encodeURIComponent(title || "")}`;
}

export function resolveAssetPrimaryAction(videoUrl: string, title: string, latestJob?: JobLike): AssetPrimaryAction {
  if (!latestJob) {
    return {
      kind: "publish",
      label: "발행 화면",
      href: toPublishFormHref(videoUrl, title),
    };
  }
  const attempts = typeof latestJob.attempts === "number" ? latestJob.attempts : 0;
  if (canDeletePublishJob(latestJob.status, attempts) && latestJob.status === "failed") {
    return { kind: "delete", label: "실패 작업 정리", jobId: latestJob.id };
  }
  if (isPendingPublishJob(latestJob.status)) {
    return { kind: "run-now", label: "지금 바로 올리기", jobId: latestJob.id };
  }
  if (canDeletePublishJob(latestJob.status, attempts) && latestJob.status === "canceled") {
    return { kind: "delete", label: "취소 작업 정리", jobId: latestJob.id };
  }
  return {
    kind: "publish",
    label: "발행 화면",
    href: toPublishFormHref(videoUrl, title),
  };
}

export function resolveHomeRecentAction(videoUrl: string, title: string, latestJob?: JobLike): { label: string; href: string; detail: string } {
  if (!latestJob) return { label: "바로 발행하기", href: toPublishFormHref(videoUrl, title), detail: "needs_attention" };
  if (latestJob.publishedUrl) return { label: "게시물 열기", href: latestJob.publishedUrl, detail: "open_published_post" };
  if (latestJob.status === "failed" || latestJob.status === "canceled") {
    return { label: "바로 발행하기", href: toPublishFormHref(videoUrl, title), detail: "needs_attention" };
  }
  if (isPendingPublishJob(latestJob.status)) {
    return { label: "예약 작업 관리", href: "/assets", detail: "manage_pending_job" };
  }
  return { label: "발행 화면으로", href: toPublishFormHref(videoUrl, title), detail: "continue_publish" };
}
