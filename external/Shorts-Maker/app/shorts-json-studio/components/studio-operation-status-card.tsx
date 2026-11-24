"use client";

import { useEffect, useMemo, useState } from "react";

type StudioOperationStatusTone = "neutral" | "active" | "success" | "error";

type StudioOperationStatusCardProps = {
  busy: boolean;
  status: string;
  idleTitle?: string;
  idleDescription?: string;
  label?: string;
};

type StudioOperationStatusDescriptor = {
  tone: StudioOperationStatusTone;
  title: string;
  description: string;
  stepLabel: string | null;
};

function extractStepLabel(status: string): string | null {
  const matched = status.match(/^(\d+\/\d+)/);
  return matched?.[1] || null;
}

function formatElapsedLabel(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

function resolveStatusDescriptor(
  status: string,
  busy: boolean,
  idleTitle: string,
  idleDescription: string
): StudioOperationStatusDescriptor {
  const normalized = status.trim();
  const stepLabel = extractStepLabel(normalized);

  if (!normalized) {
    return {
      tone: busy ? "active" : "neutral",
      title: busy ? "작업을 시작하는 중" : idleTitle,
      description: busy ? "요청을 보내기 위한 상태를 정리하고 있습니다." : idleDescription,
      stepLabel,
    };
  }

  if (normalized.includes("실패") || normalized.includes("오류")) {
    return {
      tone: "error",
      title: "작업이 실패했습니다",
      description: "현재 상태 문구를 확인한 뒤 다시 시도해 주세요. 같은 단계에서 반복되면 원인 메시지가 필요합니다.",
      stepLabel,
    };
  }

  if (normalized.includes("완료")) {
    return {
      tone: "success",
      title: "작업이 완료되었습니다",
      description: "결과가 현재 작업 화면에 반영되었습니다. 다음 단계로 진행할 수 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("payload 정리") || normalized.includes("요청 준비")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "미리보기 요청을 준비하는 중",
      description: "JSON, 템플릿, 미디어 설정을 묶어서 서버에 보낼 준비를 하고 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("Codex") || normalized.includes("슬라이드 준비 중")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "Codex가 이미지 후보를 찾는 중",
      description: "검색/생성 후보를 계획하고 미리보기용 소스를 정리하는 단계입니다. 이 구간이 가장 오래 걸릴 수 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("크롤링/선택") || normalized.includes("이미지 크롤링") || normalized.includes("이미지 선택")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "실제 이미지를 찾고 고르는 중",
      description: "Codex가 정한 query로 provider를 조회하고, 중복과 품질을 비교해 최종 이미지를 고르는 단계입니다.",
      stepLabel,
    };
  }

  if (normalized.includes("프레임 반영")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "미리보기 프레임을 반영하는 중",
      description: "받아온 슬라이드를 현재 편집 상태와 합치고 화면에 반영하고 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("SFX 자동 배정")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "SFX 자동 배정 중",
      description: "현재 슬라이드에 맞춰 효과음 큐를 계산하고 반영하고 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("확인본") || normalized.includes("최종")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "영상 제작 작업 진행 중",
      description: "오디오, 자막, 업로드용 결과를 순서대로 처리하고 있습니다.",
      stepLabel,
    };
  }

  if (normalized.includes("발행")) {
    return {
      tone: busy ? "active" : "neutral",
      title: "발행 작업 진행 중",
      description: "발행 요청을 등록하고 채널 작업 큐에 연결하고 있습니다.",
      stepLabel,
    };
  }

  return {
    tone: busy ? "active" : "neutral",
    title: busy ? "작업 진행 중" : idleTitle,
    description: busy ? "백그라운드 작업이 아직 끝나지 않았습니다. 상태 문구를 계속 갱신합니다." : idleDescription,
    stepLabel,
  };
}

export function StudioOperationStatusCard({
  busy,
  status,
  idleTitle = "대기 중",
  idleDescription = "작업을 시작하면 여기에서 현재 단계와 완료 여부를 보여줍니다.",
  label = "현재 작업",
}: StudioOperationStatusCardProps) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (busy) {
      setStartedAt((current) => current ?? Date.now());
      return;
    }
    setStartedAt(null);
  }, [busy]);

  useEffect(() => {
    if (!busy || !startedAt) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy, startedAt]);

  const descriptor = useMemo(
    () => resolveStatusDescriptor(status, busy, idleTitle, idleDescription),
    [busy, idleDescription, idleTitle, status]
  );
  const elapsedLabel = useMemo(() => {
    if (!busy || !startedAt) return "";
    const seconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
    return formatElapsedLabel(seconds);
  }, [busy, nowMs, startedAt]);

  return (
    <div className={`studio-operation-status-card is-${descriptor.tone}`} aria-live="polite">
      <div className="studio-operation-status-card-head">
        <span className="studio-operation-status-label">{label}</span>
        <div className="studio-operation-status-meta">
          {descriptor.stepLabel ? <span className="studio-operation-status-chip">{descriptor.stepLabel}</span> : null}
          {elapsedLabel ? <span className="studio-operation-status-chip">{elapsedLabel} 경과</span> : null}
        </div>
      </div>
      <div className="studio-operation-status-title-row">
        {busy ? <span className="studio-operation-status-spinner" aria-hidden="true" /> : null}
        <strong>{descriptor.title}</strong>
      </div>
      <p className="studio-operation-status-description">{descriptor.description}</p>
      {status.trim() ? <div className="studio-operation-status-detail">상태: {status.trim()}</div> : null}
    </div>
  );
}
