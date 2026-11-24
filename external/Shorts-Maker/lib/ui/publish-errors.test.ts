import test from "node:test";
import assert from "node:assert/strict";
import { toUiErrorMessage } from "./publish-errors";

test("toUiErrorMessage explains exact-output render blockers in Korean", () => {
  assert.equal(
    toUiErrorMessage("BGM_ASSET_UNAVAILABLE", "raw"),
    "선택한 BGM 파일을 불러올 수 없습니다. BGM을 다시 선택하거나 파일을 확인해 주세요."
  );
  assert.equal(
    toUiErrorMessage("MEMORY_BUDGET_EXCEEDED", "raw"),
    "현재 설정을 그대로 렌더하면 메모리 한도를 넘습니다. 영상 길이·이미지 수를 줄이거나 렌더 메모리 한도를 높인 뒤 다시 시도해 주세요."
  );
  assert.equal(
    toUiErrorMessage("SFX_ASSET_UNAVAILABLE", "raw"),
    "배치된 효과음 파일을 불러올 수 없습니다. 효과음을 다시 추천하거나 파일을 확인해 주세요."
  );
  assert.equal(toUiErrorMessage("UNMAPPED", "원본 오류"), "원본 오류");
});
