import { randomUUID } from "node:crypto";
import { resolveCategoryChannelId } from "@/lib/publish/channel-category";
import { enqueuePublishJob } from "@/lib/publish/scheduler";
import { parsePublishInput } from "@/lib/publish/payload";
import { createPublishJob, getPublishCategoryChannel, getYoutubeAccount, updatePublishJobStatus } from "@/lib/publish/publish-store";
import type { PublishJobRecord } from "@/lib/publish/types";

export type SubmitPublishMode = "publish" | "schedule";

export class SubmitPublishCommandError extends Error {
  status: number;
  errorCode: string;
  retryable: boolean;

  constructor(message: string, options: { status: number; errorCode: string; retryable?: boolean }) {
    super(message);
    this.name = "SubmitPublishCommandError";
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.retryable = Boolean(options.retryable);
  }
}

export async function submitPublishCommand(input: {
  userId: string;
  body: unknown;
  mode: SubmitPublishMode;
}): Promise<PublishJobRecord> {
  const parsed = parsePublishInput(input.body);
  const scheduledAt = input.mode === "schedule" ? parsed.scheduledAt : null;

  if (input.mode === "schedule" && (!scheduledAt || scheduledAt <= Date.now())) {
    throw new SubmitPublishCommandError("예약 시간은 현재보다 이후여야 합니다.", {
      status: 400,
      errorCode: "SCHEDULE_DATETIME_INVALID",
    });
  }

  const persistedCategoryChannel = parsed.publishCategory
    ? await getPublishCategoryChannel(input.userId, parsed.publishCategory)
    : null;
  const categoryBinding = resolveCategoryChannelId(parsed.publishCategory);
  const mappedChannelId = persistedCategoryChannel || categoryBinding.channelId;

  if (parsed.publishCategory && !mappedChannelId) {
    throw new SubmitPublishCommandError(
      `카테고리 '${parsed.publishCategory}'에 대한 채널 매핑이 없습니다. 발행 화면에서 설정하거나 ${categoryBinding.envKey} 값을 지정해 주세요.`,
      {
        status: 400,
        errorCode: "CATEGORY_CHANNEL_MAPPING_MISSING",
      }
    );
  }

  const account = await getYoutubeAccount(input.userId, mappedChannelId || parsed.channelId || undefined);
  if (!account) {
    throw new SubmitPublishCommandError("연결된 YouTube 계정이 없습니다. 먼저 채널을 연결해 주세요.", {
      status: 400,
      errorCode: "YOUTUBE_ACCOUNT_NOT_CONNECTED",
    });
  }

  const job = await createPublishJob({
    userId: input.userId,
    id: randomUUID(),
    channelId: account.channelId,
    publishCategory: parsed.publishCategory,
    videoUrl: parsed.videoUrl,
    title: parsed.title,
    description: parsed.description,
    tags: parsed.tags,
    visibility: parsed.visibility,
    scheduledAt,
  });

  try {
    await enqueuePublishJob(job.id, input.userId, scheduledAt ? Math.max(0, scheduledAt - Date.now()) : 0);
  } catch (error) {
    await updatePublishJobStatus({
      userId: input.userId,
      id: job.id,
      status: "failed",
      attempts: 0,
      lastError: `큐 등록 실패: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw new SubmitPublishCommandError("발행 작업 큐 등록에 실패했습니다.", {
      status: 502,
      errorCode: "PUBLISH_QUEUE_ENQUEUE_FAILED",
      retryable: true,
    });
  }
  return job;
}
