export const STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL = "중단됨·재시도 필요";

export type StudioInterruptedOperationKind = "preview_prepare" | "sfx_plan" | "draft_render" | "final_render" | "publish" | "schedule";

export type StudioInterruptedOperation = {
  kind: StudioInterruptedOperationKind;
  label: string;
  persistedStatus: string;
  recoveryStatus: string;
};

const PREVIEW_PREPARE_STATUS_PATTERN =
  /^\d+\/\d+\s+(?:미리보기 요청 준비|슬라이드별 AI 이미지 프롬프트 준비|미리보기용 Codex 이미지 후보 찾는|프롬프트 기반 미리보기 반영|실제 이미지 크롤링\/선택|이미지 없는 슬라이드 Codex 생성|미리보기 프레임 반영) 중$/;
const SFX_PLAN_STATUS_PATTERN = /^(?:\d+\/\d+\s+)?SFX 자동 배정 중$/;
const DRAFT_RENDER_STATUS_PATTERN =
  /^\d+\/3\s+확인본 (?:오디오 및 타임라인 계산|서버 렌더링|렌더 큐 등록|렌더 대기열 처리|MP4 렌더링|반영) 중$/;
const FINAL_RENDER_STATUS_PATTERN =
  /^\d+\/3\s+최종 (?:오디오 및 타임라인 계산|서버 렌더링|렌더 큐 등록|렌더 대기열 처리|MP4 오디오 합성|결과 반영) 중$/;
const RECOVERED_STATUS_PATTERN = /^(.+?) 중단됨·재시도 필요\. 같은 단계에서 다시 실행해 주세요\.$/;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRecoveryStatus(label: string): string {
  return `${label} ${STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL}. 같은 단계에서 다시 실행해 주세요.`;
}

export function resolveInterruptedStudioOperation(status: unknown): StudioInterruptedOperation | null {
  const persistedStatus = trimString(status);
  if (!persistedStatus) return null;

  const recoveredMatch = RECOVERED_STATUS_PATTERN.exec(persistedStatus);
  if (recoveredMatch) {
    const label = recoveredMatch[1] || "";
    if (label === "미리보기 준비") {
      return {
        kind: "preview_prepare",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
    if (label === "SFX 자동 배정") {
      return {
        kind: "sfx_plan",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
    if (label === "확인본 렌더") {
      return {
        kind: "draft_render",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
    if (label === "최종 렌더") {
      return {
        kind: "final_render",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
    if (label === "발행 등록") {
      return {
        kind: "publish",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
    if (label === "예약 등록") {
      return {
        kind: "schedule",
        label,
        persistedStatus,
        recoveryStatus: persistedStatus,
      };
    }
  }

  if (PREVIEW_PREPARE_STATUS_PATTERN.test(persistedStatus)) {
    const label = "미리보기 준비";
    return {
      kind: "preview_prepare",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }
  if (SFX_PLAN_STATUS_PATTERN.test(persistedStatus)) {
    const label = "SFX 자동 배정";
    return {
      kind: "sfx_plan",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }
  if (DRAFT_RENDER_STATUS_PATTERN.test(persistedStatus)) {
    const label = "확인본 렌더";
    return {
      kind: "draft_render",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }
  if (FINAL_RENDER_STATUS_PATTERN.test(persistedStatus)) {
    const label = "최종 렌더";
    return {
      kind: "final_render",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }
  if (persistedStatus === "기존 업로드 자산으로 발행 작업 등록 중") {
    const label = "발행 등록";
    return {
      kind: "publish",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }
  if (persistedStatus === "기존 업로드 자산으로 예약 작업 등록 중") {
    const label = "예약 등록";
    return {
      kind: "schedule",
      label,
      persistedStatus,
      recoveryStatus: toRecoveryStatus(label),
    };
  }

  return null;
}

export function recoverPersistedStudioRenderStatus(status: unknown): string {
  const persistedStatus = trimString(status);
  return resolveInterruptedStudioOperation(persistedStatus)?.recoveryStatus || persistedStatus;
}
