import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL,
  recoverPersistedStudioRenderStatus,
  resolveInterruptedStudioOperation,
} from "./studio-operation-recovery";

test("resolveInterruptedStudioOperation explicitly recognizes persisted long-running studio statuses", () => {
  const cases = [
    ["1/4 미리보기 요청 준비 중", "preview_prepare", "미리보기 준비"],
    ["2/4 미리보기용 Codex 이미지 후보 찾는 중", "preview_prepare", "미리보기 준비"],
    ["3/5 실제 이미지 크롤링/선택 중", "preview_prepare", "미리보기 준비"],
    ["4/5 이미지 없는 슬라이드 Codex 생성 중", "preview_prepare", "미리보기 준비"],
    ["SFX 자동 배정 중", "sfx_plan", "SFX 자동 배정"],
    ["6/6 SFX 자동 배정 중", "sfx_plan", "SFX 자동 배정"],
    ["1/3 확인본 오디오 및 타임라인 계산 중", "draft_render", "확인본 렌더"],
    ["2/3 확인본 렌더 대기열 처리 중", "draft_render", "확인본 렌더"],
    ["2/3 확인본 서버 렌더링 중", "draft_render", "확인본 렌더"],
    ["3/3 확인본 반영 중", "draft_render", "확인본 렌더"],
    ["1/3 최종 오디오 및 타임라인 계산 중", "final_render", "최종 렌더"],
    ["2/3 최종 렌더 큐 등록 중", "final_render", "최종 렌더"],
    ["2/3 최종 MP4 오디오 합성 중", "final_render", "최종 렌더"],
    ["3/3 최종 결과 반영 중", "final_render", "최종 렌더"],
    ["기존 업로드 자산으로 발행 작업 등록 중", "publish", "발행 등록"],
    ["기존 업로드 자산으로 예약 작업 등록 중", "schedule", "예약 등록"],
  ] as const;

  for (const [status, kind, label] of cases) {
    const operation = resolveInterruptedStudioOperation(status);
    assert.equal(operation?.kind, kind);
    assert.equal(operation?.label, label);
    assert.equal(operation?.persistedStatus, status);
    assert.equal(operation?.recoveryStatus, `${label} ${STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL}. 같은 단계에서 다시 실행해 주세요.`);
  }
});

test("recoverPersistedStudioRenderStatus is idempotent and leaves completed, failed, and informational statuses unchanged", () => {
  const recovered = recoverPersistedStudioRenderStatus("2/3 최종 서버 렌더링 중");

  assert.equal(recovered, `최종 렌더 ${STUDIO_INTERRUPTED_OPERATION_STAGE_LABEL}. 같은 단계에서 다시 실행해 주세요.`);
  assert.equal(recoverPersistedStudioRenderStatus(recovered), recovered);
  assert.equal(recoverPersistedStudioRenderStatus("최종 영상 제작 완료"), "최종 영상 제작 완료");
  assert.equal(recoverPersistedStudioRenderStatus("발행 완료"), "발행 완료");
  assert.equal(recoverPersistedStudioRenderStatus("예약 완료"), "예약 완료");
  assert.equal(recoverPersistedStudioRenderStatus("미리보기 준비 실패: 네트워크 오류"), "미리보기 준비 실패: 네트워크 오류");
  assert.equal(recoverPersistedStudioRenderStatus("대본만 업데이트했습니다. 수동 사진은 유지됩니다."), "대본만 업데이트했습니다. 수동 사진은 유지됩니다.");
  assert.equal(recoverPersistedStudioRenderStatus("막연히 처리 중처럼 보이는 일반 문장"), "막연히 처리 중처럼 보이는 일반 문장");
  assert.equal(recoverPersistedStudioRenderStatus(null), "");
});

test("resolveInterruptedStudioOperation recognizes already recovered statuses for project-index attention", () => {
  const recovered = "최종 렌더 중단됨·재시도 필요. 같은 단계에서 다시 실행해 주세요.";
  const operation = resolveInterruptedStudioOperation(recovered);

  assert.equal(operation?.kind, "final_render");
  assert.equal(operation?.label, "최종 렌더");
  assert.equal(operation?.recoveryStatus, recovered);
  assert.equal(recoverPersistedStudioRenderStatus(recovered), recovered);
});
