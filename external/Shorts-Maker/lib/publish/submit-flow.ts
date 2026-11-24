import { trackWorkflowEvent } from "@/lib/telemetry/client";
import { toTelemetryErrorDetail } from "@/lib/telemetry/error-detail";
import type { PublishPreflightIssue } from "@/lib/publish/preflight";
import type { WorkflowEventPage } from "@/lib/telemetry/schema";

type PublishSubmissionMode = "publish" | "schedule";

export async function executePublishSubmission(input: {
  page: WorkflowEventPage;
  mode: PublishSubmissionMode;
  issues?: PublishPreflightIssue[];
  submit: () => Promise<unknown>;
  refresh: () => Promise<void>;
  setMessage: (message: string) => void;
  successMessage: string;
  preflightDetail?: string;
  onSuccess?: () => void;
  onFailure?: (error: unknown) => void;
}): Promise<void> {
  let failureTracked = false;
  const stage = input.mode === "publish" ? "publish" : "schedule";

  if ((input.issues || []).length > 0) {
    if (input.preflightDetail) {
      trackWorkflowEvent({
        name: "publish_request_failed",
        page: input.page,
        stage,
        status: "failure",
        detail: input.preflightDetail,
      });
      failureTracked = true;
    }
    throw new Error(input.issues?.[0]?.message || "발행 전 점검 항목을 먼저 확인해 주세요.");
  }

  try {
    await input.submit();
  } catch (error) {
    const telemetry = toTelemetryErrorDetail(error);
    if (telemetry.errorCode) {
      trackWorkflowEvent({
        name: "publish_request_failed",
        page: input.page,
        stage,
        status: "failure",
        detail: telemetry.detail,
        errorCode: telemetry.errorCode,
        retryable: telemetry.retryable,
      });
      failureTracked = true;
    }
    if (!failureTracked) {
      trackWorkflowEvent({
        name: "publish_request_failed",
        page: input.page,
        stage,
        status: "failure",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    input.onFailure?.(error);
    input.setMessage(error instanceof Error ? error.message : String(error));
    return;
  }

  trackWorkflowEvent({
    name: "publish_request_succeeded",
    page: input.page,
    stage,
    status: "success",
  });
  input.setMessage(input.successMessage);
  input.onSuccess?.();

  try {
    await input.refresh();
  } catch (error) {
    trackWorkflowEvent({
      name: "stage_timing",
      page: input.page,
      stage: `${stage}_refresh`,
      status: "failure",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
