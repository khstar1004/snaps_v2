import assert from "node:assert/strict";
import test from "node:test";
import type { PreparedSlide } from "@/types/studio-json";
import {
  buildStudioWorkspaceNavigationItems,
  findStudioWorkspaceGroupIndexForSlide,
  groupStudioWorkspaceIssuesByTarget,
  resolveStudioWorkspaceNavigationSlides,
} from "./studio-workspace-navigation";

const slides: PreparedSlide[] = [
  {
    title: "첫 장면",
    text: "첫 문장",
    lines: ["첫 문장", "둘째 문장"],
    layout: "photo+body",
    groupId: 1,
    stepIndex: 0,
    imageUrl: "/image-1.png",
    sfxCue: { enabled: true, tag: "transition" },
  },
  {
    title: "첫 장면 두 번째 화면",
    text: "셋째 문장",
    lines: ["셋째 문장"],
    layout: "photo+body",
    groupId: 1,
    stepIndex: 1,
    imageUrl: "/image-2.png",
  },
  {
    title: "둘째 장면",
    text: "마지막 문장",
    lines: ["마지막 문장"],
    layout: "photo+body",
    groupId: 2,
    stepIndex: 0,
  },
];

test("workspace navigation groups linked slides and keeps scene detail", () => {
  const items = buildStudioWorkspaceNavigationItems({
    step: 1,
    slides,
    imageApproved: false,
    preflightIssues: [],
  });

  assert.equal(items.length, 2);
  assert.deepEqual(items[0]?.indexes, [0, 1]);
  assert.equal(items[0]?.title, "첫 장면 두 번째 화면");
  assert.equal(items[0]?.detail, "3개 라인 · 2개 화면");
  assert.equal(items[0]?.statusLabel, "구조 있음");
});

test("image navigation distinguishes reviewable and missing scenes", () => {
  const items = buildStudioWorkspaceNavigationItems({
    step: 2,
    slides,
    imageApproved: false,
    preflightIssues: [],
  });

  assert.equal(items[0]?.statusLabel, "이미지 검수");
  assert.equal(items[0]?.tone, "warning");
  assert.equal(items[1]?.statusLabel, "생성 필요");
  assert.equal(items[1]?.tone, "error");
});

test("audio navigation reports the effective SFX count", () => {
  const items = buildStudioWorkspaceNavigationItems({
    step: 3,
    slides,
    imageApproved: true,
    preflightIssues: [],
  });

  assert.equal(items[0]?.statusLabel, "효과음 1개");
  assert.equal(items[0]?.tone, "success");
  assert.equal(items[1]?.statusLabel, "효과음 없음");
});

test("review navigation prioritizes blockers over warnings per scene", () => {
  const items = buildStudioWorkspaceNavigationItems({
    step: 4,
    slides,
    imageApproved: true,
    preflightIssues: [
      { code: "voice", severity: "blocker", message: "음성 누락", slideIndex: 0, targetStep: "audio" },
      { code: "sfx", severity: "warning", message: "효과음 확인", slideIndex: 0, targetStep: "caption_audio" },
      { code: "image", severity: "warning", message: "이미지 확인", slideIndex: 2, targetStep: "image" },
    ],
  });

  assert.equal(items[0]?.statusLabel, "차단 1개");
  assert.equal(items[0]?.tone, "error");
  assert.equal(items[1]?.statusLabel, "경고 1개");
  assert.equal(items[1]?.tone, "warning");
});

test("workspace navigation finds the linked group for an issue slide", () => {
  const items = buildStudioWorkspaceNavigationItems({
    step: 4,
    slides,
    imageApproved: true,
    preflightIssues: [],
  });

  assert.equal(findStudioWorkspaceGroupIndexForSlide(items, 1), 0);
  assert.equal(findStudioWorkspaceGroupIndexForSlide(items, 2), 1);
  assert.equal(findStudioWorkspaceGroupIndexForSlide(items, 9), null);
  assert.equal(findStudioWorkspaceGroupIndexForSlide(items, undefined), null);
});

test("workspace navigation falls back to valid script JSON before images are prepared", () => {
  const resolved = resolveStudioWorkspaceNavigationSlides({
    preparedSlides: [],
    scriptJsonText: JSON.stringify({
      slides: [
        {
          title: "대본 장면",
          text: "첫 문장",
          lines: ["첫 문장"],
          layout: "photo+body",
          dialogueSegments: [{ type: "narration", text: "첫 문장" }],
        },
      ],
    }),
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.title, "대본 장면");
  assert.equal(
    buildStudioWorkspaceNavigationItems({
      step: 2,
      slides: resolved,
      imageApproved: false,
      preflightIssues: [],
    })[0]?.detail,
    "1개 라인"
  );
});

test("workspace navigation prefers prepared slides and ignores invalid script JSON", () => {
  assert.equal(
    resolveStudioWorkspaceNavigationSlides({
      preparedSlides: slides,
      scriptJsonText: "{invalid",
    }),
    slides
  );
  assert.deepEqual(
    resolveStudioWorkspaceNavigationSlides({
      preparedSlides: [],
      scriptJsonText: "{invalid",
    }),
    []
  );
});

test("workspace review issues are grouped by their resolution stage", () => {
  const groups = groupStudioWorkspaceIssuesByTarget([
    { code: "image", severity: "blocker", message: "이미지 없음", targetStep: "image" },
    { code: "voice", severity: "warning", message: "음성 확인", targetStep: "audio" },
    { code: "caption", severity: "warning", message: "자막 확인", targetStep: "caption_audio" },
  ]);

  assert.deepEqual(groups.map((group) => group.label), ["음성", "이미지", "자막·오디오"]);
  assert.equal(groups[1]?.issues[0]?.code, "image");
});
