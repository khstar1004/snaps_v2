import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const RENDER_RESULT_MUTATION_PATTERN =
  /\b(?:setVideoUrl(?:Action)?|setUploadedVideoUrl(?:Action)?|revokeIfBlobUrl)\b/u;

function readSiblingSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

for (const [label, fileName] of [
  ["대본 재생성", "./use-studio-script-generation-actions.ts"],
  ["미리보기 재준비", "./use-studio-prepare-flow.ts"],
  ["슬라이드 편집", "./use-studio-slide-edit-actions.ts"],
] as const) {
  test(`${label} 경로는 기존 확인본과 최종본 URL을 직접 지우지 않는다`, () => {
    const source = readSiblingSource(fileName);

    assert.doesNotMatch(source, RENDER_RESULT_MUTATION_PATTERN);
  });
}
