import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const componentSource = readFileSync(
  resolve("app/shorts-json-studio/components/studio-project-settings-drawer.tsx"),
  "utf8"
);

test("StudioProjectSettingsDrawer exposes the profile sync prop contract", () => {
  for (const contractName of [
    "profileToProjectGroupIds",
    "projectToProfileGroupIds",
    "hasProfileSnapshot",
    "syncBusy",
    "syncMessage",
    "onRefreshProfileAction",
    "onApplyProfileGroupsAction",
    "onSaveProjectGroupsAction",
  ]) {
    assert.match(componentSource, new RegExp(`\\b${contractName}\\b`));
  }
});

test("StudioProjectSettingsDrawer keeps guarded profile sync copy", () => {
  assert.match(componentSource, /프로필 → 프로젝트/);
  assert.match(componentSource, /프로젝트 → 프로필/);
  assert.match(componentSource, /새 기본값을 이 프로젝트에 선택 적용/);
  assert.match(componentSource, /현재 값을 프로필 기본값으로 저장/);
  assert.match(componentSource, /선택 변경 목록/);
  assert.match(componentSource, /영향 범위/);
  assert.match(componentSource, /자동 저장으로 이전 상태를 복구할 수 있습니다/);
  assert.match(componentSource, /승인된 자산은 영향받는 범위만 다시 검토합니다/);
});

test("StudioProjectSettingsDrawer reports accessible sync status states", () => {
  assert.match(componentSource, /role: "status"/);
  assert.match(componentSource, /role: "alert"/);
  assert.match(componentSource, /role=\{visibleSyncState\.role\}/);
});
