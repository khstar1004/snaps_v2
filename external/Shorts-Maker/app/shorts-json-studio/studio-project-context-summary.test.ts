import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudioProjectContextSummary } from "./studio-project-context-summary";

test("resolveStudioProjectContextSummary keeps project id and frozen profile context", () => {
  const summary = resolveStudioProjectContextSummary({
    workName: "  7월 뉴스 쇼츠  ",
    profileSnapshotLabel: "잠긴 뉴스 프로필",
    projectProfileSnapshot: {
      version: 1,
      projectId: "project-fixed-1",
      createdAt: "2026-07-19T12:00:00.000Z",
      contentProfile: {
        category: "news",
        label: "라이브 뉴스 프로필",
        metadataSnapshot: null,
      },
    },
    guidedStageLabel: "3. 이미지",
    templateId: "default",
    templateLabel: "기본 카드",
  });

  assert.equal(summary.projectName, "7월 뉴스 쇼츠");
  assert.equal(summary.profileLabel, "잠긴 뉴스 프로필");
  assert.equal(summary.projectId, "project-fixed-1");
  assert.match(summary.profileCreatedAtLabel, /2026/);
  assert.equal(summary.guidedStageLabel, "3. 이미지");
  assert.equal(summary.templateSummary, "기본 카드 (default)");
  assert.equal(summary.outputSummary, "1080×1920");
});

test("resolveStudioProjectContextSummary falls back without creating a profile selector context", () => {
  const summary = resolveStudioProjectContextSummary({
    workName: "",
    fallbackTitle: "대본 제목",
    projectProfileSnapshot: null,
    guidedStageLabel: "1. 대본",
    templateId: "black",
    templateLabel: "",
  });

  assert.equal(summary.projectName, "대본 제목");
  assert.equal(summary.profileLabel, "프로필 스냅샷 없음");
  assert.equal(summary.profileCreatedAtLabel, "생성일 정보 없음");
  assert.equal(summary.projectId, "");
  assert.equal(summary.templateSummary, "black (black)");
});
