import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveStudioRenderPrimaryAction,
  resolveStudioRenderReadiness,
  resolveStudioRenderStageCopy,
} from "./use-studio-render-publish-view-model";

test("render readiness accepts a current draft video", () => {
  assert.deepEqual(
    resolveStudioRenderReadiness({
      renderNeedsRefresh: false,
      finalNeedsRefresh: false,
      uploadedVideoUrl: null,
      videoUrl: "blob:current-draft",
    }),
    {
      hasDraftVideo: true,
      hasFinalVideo: false,
      draftIsCurrent: true,
      finalIsCurrent: false,
      hasRenderedVideo: true,
    }
  );
});

test("render readiness rejects a stale draft after settings change", () => {
  assert.deepEqual(
    resolveStudioRenderReadiness({
      renderNeedsRefresh: true,
      finalNeedsRefresh: false,
      uploadedVideoUrl: null,
      videoUrl: "blob:stale-draft",
    }),
    {
      hasDraftVideo: true,
      hasFinalVideo: false,
      draftIsCurrent: false,
      finalIsCurrent: false,
      hasRenderedVideo: false,
    }
  );
});

test("render readiness accepts a current final result even when the draft URL is absent", () => {
  assert.deepEqual(
    resolveStudioRenderReadiness({
      renderNeedsRefresh: false,
      finalNeedsRefresh: false,
      uploadedVideoUrl: "https://local.test/final.mp4",
      videoUrl: null,
    }),
    {
      hasDraftVideo: false,
      hasFinalVideo: true,
      draftIsCurrent: false,
      finalIsCurrent: true,
      hasRenderedVideo: true,
    }
  );
});

test("render stage copy never presents a stale final video as complete", () => {
  assert.deepEqual(
    resolveStudioRenderStageCopy({
      hasDraftVideo: true,
      hasFinalVideo: true,
      renderNeedsRefresh: true,
      finalNeedsRefresh: true,
    }),
    {
      label: "확인본·최종 영상 다시 필요",
      description: "대본·음성·이미지 또는 효과음이 변경되었습니다. 이전 결과는 비교용으로 유지되며, 현재 내용으로 1차 확인본부터 다시 검수하세요.",
    }
  );
});

test("render stage copy keeps a current final video marked complete", () => {
  assert.deepEqual(
    resolveStudioRenderStageCopy({
      hasDraftVideo: true,
      hasFinalVideo: true,
      renderNeedsRefresh: false,
      finalNeedsRefresh: false,
    }),
    {
      label: "최종 영상 완료",
      description: "확인본 검수를 통과한 구성에 BGM까지 포함해 로컬 라이브러리에 등록된 최종 MP4입니다.",
    }
  );
});

test("render stage copy explains that BGM is added at final render", () => {
  assert.deepEqual(
    resolveStudioRenderStageCopy({
      hasDraftVideo: false,
      hasFinalVideo: false,
      renderNeedsRefresh: false,
      finalNeedsRefresh: false,
    }),
    {
      label: "확인본 대기",
      description:
        "미리보기를 준비한 뒤 1차 확인본을 먼저 제작하면 나레이션, 자막, 배속, 효과음을 실제 MP4로 검토할 수 있습니다. BGM은 최종 렌더에서 합칩니다.",
    }
  );
});

test("render readiness keeps the draft current when only final-only audio changed", () => {
  assert.deepEqual(
    resolveStudioRenderReadiness({
      renderNeedsRefresh: false,
      finalNeedsRefresh: true,
      uploadedVideoUrl: "https://local.test/previous-final.mp4",
      videoUrl: "https://local.test/current-draft.mp4",
    }),
    {
      hasDraftVideo: true,
      hasFinalVideo: true,
      draftIsCurrent: true,
      finalIsCurrent: false,
      hasRenderedVideo: true,
    }
  );
});

test("render stage copy asks only for the final video when the draft is still current", () => {
  assert.deepEqual(
    resolveStudioRenderStageCopy({
      hasDraftVideo: true,
      hasFinalVideo: true,
      renderNeedsRefresh: false,
      finalNeedsRefresh: true,
    }),
    {
      label: "최종 영상 다시 필요",
      description: "1차 확인본은 현재 내용과 일치합니다. 이전 최종본은 비교용으로 유지되며, 사전검사 후 BGM을 반영한 최종 영상만 다시 제작하세요.",
    }
  );
});

test("primary render action requires a current draft before preflight", () => {
  assert.deepEqual(
    resolveStudioRenderPrimaryAction({
      isJsonValid: true,
      hasPreparedSlides: true,
      hasDraftVideo: true,
      draftNeedsRefresh: true,
      preflightHasRun: false,
      preflightBlockerCount: 4,
      hasFinalVideo: false,
      finalNeedsRefresh: true,
    }),
    {
      kind: "render_draft",
      label: "미리보기 업데이트",
      disabled: false,
    }
  );
});

test("primary render action runs preflight after the current draft is ready", () => {
  assert.deepEqual(
    resolveStudioRenderPrimaryAction({
      isJsonValid: true,
      hasPreparedSlides: true,
      hasDraftVideo: true,
      draftNeedsRefresh: false,
      preflightHasRun: false,
      preflightBlockerCount: 0,
      hasFinalVideo: false,
      finalNeedsRefresh: true,
    }),
    {
      kind: "run_preflight",
      label: "사전검사",
      disabled: false,
    }
  );
});

test("primary render action blocks final render when preflight has blockers", () => {
  const action = resolveStudioRenderPrimaryAction({
    isJsonValid: true,
    hasPreparedSlides: true,
    hasDraftVideo: true,
    draftNeedsRefresh: false,
    preflightHasRun: true,
    preflightBlockerCount: 2,
    hasFinalVideo: false,
    finalNeedsRefresh: true,
  });

  assert.equal(action.kind, "fix_blockers");
  assert.equal(action.disabled, true);
});

test("primary render action allows final only after a clean preflight", () => {
  assert.equal(
    resolveStudioRenderPrimaryAction({
      isJsonValid: true,
      hasPreparedSlides: true,
      hasDraftVideo: true,
      draftNeedsRefresh: false,
      preflightHasRun: true,
      preflightBlockerCount: 0,
      hasFinalVideo: false,
      finalNeedsRefresh: true,
    }).kind,
    "render_final"
  );
});

test("BGM-only changes rerender the final video without rebuilding the current draft", () => {
  assert.deepEqual(
    resolveStudioRenderPrimaryAction({
      isJsonValid: true,
      hasPreparedSlides: true,
      hasDraftVideo: true,
      draftNeedsRefresh: false,
      preflightHasRun: true,
      preflightBlockerCount: 0,
      hasFinalVideo: true,
      finalNeedsRefresh: true,
    }),
    {
      kind: "render_final",
      label: "최종 렌더 다시 시도",
      disabled: false,
    }
  );
});

test("primary render action ends at the current completed video", () => {
  assert.deepEqual(
    resolveStudioRenderPrimaryAction({
      isJsonValid: true,
      hasPreparedSlides: true,
      hasDraftVideo: true,
      draftNeedsRefresh: false,
      preflightHasRun: true,
      preflightBlockerCount: 0,
      hasFinalVideo: true,
      finalNeedsRefresh: false,
    }),
    {
      kind: "complete",
      label: "완성 영상 보기",
      disabled: false,
    }
  );
});
