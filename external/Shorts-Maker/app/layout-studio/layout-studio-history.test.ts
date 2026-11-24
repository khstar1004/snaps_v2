import assert from "node:assert/strict";
import test from "node:test";
import {
  appendLayoutStudioHistorySnapshot,
  popLayoutStudioHistorySnapshot,
} from "@/app/layout-studio/layout-studio-history";
import {
  DEFAULT_BRANDING,
  createDefaultCategoryTemplatePreset,
  type EditorHistorySnapshot,
} from "@/app/layout-studio/layout-studio-helpers";

function createSnapshot(seed: number): EditorHistorySnapshot {
  return {
    publishCategory: "default",
    brandingDraft: {
      ...DEFAULT_BRANDING,
      headerTitle: `헤더 ${seed}`,
    },
    templateNotesByCategory: {
      default: `메모 ${seed}`,
    },
    templatePresetByCategory: {
      default: createDefaultCategoryTemplatePreset(),
    },
  };
}

test("appendLayoutStudioHistorySnapshot deduplicates consecutive snapshots", () => {
  const snapshot = createSnapshot(1);
  const first = appendLayoutStudioHistorySnapshot([], snapshot);
  const second = appendLayoutStudioHistorySnapshot(first, snapshot);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});

test("appendLayoutStudioHistorySnapshot keeps only the latest 80 snapshots", () => {
  let stack: EditorHistorySnapshot[] = [];
  for (let index = 0; index < 85; index += 1) {
    stack = appendLayoutStudioHistorySnapshot(stack, createSnapshot(index));
  }

  assert.equal(stack.length, 80);
  assert.equal(stack[0]?.brandingDraft.headerTitle, "헤더 5");
  assert.equal(stack[79]?.brandingDraft.headerTitle, "헤더 84");
});

test("popLayoutStudioHistorySnapshot returns the latest snapshot and remaining stack", () => {
  const stack = [createSnapshot(1), createSnapshot(2)];
  const popped = popLayoutStudioHistorySnapshot(stack);

  assert.ok(popped);
  assert.equal(popped?.snapshotToApply.brandingDraft.headerTitle, "헤더 2");
  assert.equal(popped?.nextStack.length, 1);
  assert.equal(popped?.nextStack[0]?.brandingDraft.headerTitle, "헤더 1");
});

test("popLayoutStudioHistorySnapshot returns null for an empty stack", () => {
  assert.equal(popLayoutStudioHistorySnapshot([]), null);
});
