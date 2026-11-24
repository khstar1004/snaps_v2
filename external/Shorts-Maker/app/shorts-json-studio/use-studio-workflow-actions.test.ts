import assert from "node:assert/strict";
import test from "node:test";
import { __internal } from "./use-studio-workflow-actions";

test("shouldFallbackToDirectServerNativeRender detects HTML 404 route responses", () => {
  assert.equal(
    __internal.shouldFallbackToDirectServerNativeRender(new Error(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`)),
    true
  );
  assert.equal(
    __internal.shouldFallbackToDirectServerNativeRender(new Error("서버가 JSON 대신 HTML을 반환했습니다. (status 404)")),
    true
  );
});

test("shouldFallbackToDirectServerNativeRender ignores normal runtime errors", () => {
  assert.equal(__internal.shouldFallbackToDirectServerNativeRender(new Error("서버 렌더 결과 업로드 URL이 비어 있습니다.")), false);
});

test("draft render updates only the draft URL and preserves the previous final", () => {
  assert.deepEqual(
    __internal.resolveRenderedAssetUrls({
      stage: "draft",
      currentDraftUrl: "https://local.test/old-draft.mp4",
      currentFinalUrl: "https://local.test/previous-final.mp4",
      renderedUrl: "https://local.test/new-draft.mp4",
    }),
    {
      draftUrl: "https://local.test/new-draft.mp4",
      finalUrl: "https://local.test/previous-final.mp4",
    }
  );
});

test("final render updates only the final URL and preserves the reviewed draft", () => {
  assert.deepEqual(
    __internal.resolveRenderedAssetUrls({
      stage: "final",
      currentDraftUrl: "https://local.test/reviewed-draft.mp4",
      currentFinalUrl: "https://local.test/old-final.mp4",
      renderedUrl: "https://local.test/new-final.mp4",
    }),
    {
      draftUrl: "https://local.test/reviewed-draft.mp4",
      finalUrl: "https://local.test/new-final.mp4",
    }
  );
});
