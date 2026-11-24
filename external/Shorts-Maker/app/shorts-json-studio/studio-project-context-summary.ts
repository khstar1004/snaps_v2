import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import type { StudioTemplateId } from "./types";

export type StudioProjectContextSummaryInput = {
  workName?: string;
  fallbackTitle?: string;
  profileSnapshotLabel?: string;
  projectProfileSnapshot?: StudioProjectProfileSnapshot | null;
  guidedStageLabel: string;
  templateId: StudioTemplateId;
  templateLabel: string;
};

export type StudioProjectContextSummary = {
  projectName: string;
  profileLabel: string;
  profileCreatedAtLabel: string;
  projectId: string;
  guidedStageLabel: string;
  templateSummary: string;
  outputSummary: string;
};

const UNTITLED_PROJECT_LABEL = "이름 없는 프로젝트";
const UNKNOWN_CREATED_AT_LABEL = "생성일 정보 없음";
const LOCKED_OUTPUT_SUMMARY = "1080×1920";

export function formatStudioProjectContextCreatedAt(value?: string): string {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return UNKNOWN_CREATED_AT_LABEL;
  return new Date(timestamp).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveStudioProjectContextSummary(
  input: StudioProjectContextSummaryInput
): StudioProjectContextSummary {
  const projectName = String(input.workName || "").trim() || String(input.fallbackTitle || "").trim() || UNTITLED_PROJECT_LABEL;
  const snapshotProfileLabel = String(input.projectProfileSnapshot?.contentProfile.label || "").trim();
  const profileLabel = String(input.profileSnapshotLabel || "").trim() || snapshotProfileLabel || "프로필 스냅샷 없음";
  const projectId = String(input.projectProfileSnapshot?.projectId || "").trim();
  const templateLabel = String(input.templateLabel || "").trim() || input.templateId;

  return {
    projectName,
    profileLabel,
    profileCreatedAtLabel: formatStudioProjectContextCreatedAt(input.projectProfileSnapshot?.createdAt),
    projectId,
    guidedStageLabel: input.guidedStageLabel,
    templateSummary: `${templateLabel} (${input.templateId})`,
    outputSummary: LOCKED_OUTPUT_SUMMARY,
  };
}
