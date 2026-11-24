import assert from "node:assert/strict";
import test from "node:test";
import type { StudioWorkDraft } from "@/app/shorts-json-studio/types";
import type { StudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import {
  buildPersonalV1ProjectCloneDraft,
  buildPersonalV1ProjectCloneName,
  buildPersonalV1ProjectIndex,
  calculatePersonalV1ProjectStageLabel,
  filterPersonalV1ProjectIndex,
  getPersonalV1ProjectIndexStatus,
  getPersonalV1ProjectIndexStatusLabel,
  resolvePersonalV1ProjectIndexVersion,
  sortPersonalV1ProjectIndexByRepresentativeActivity,
} from "./studio-project-index";

function makeSnapshot(projectId: string, category = "alpha", label = "Alpha 채널"): StudioProjectProfileSnapshot {
  return {
    version: 1,
    projectId,
    createdAt: "2026-07-20T00:00:00.000Z",
    contentProfile: {
      category,
      label,
      metadataSnapshot: null,
    },
  };
}

function makeDraft(overrides: StudioWorkDraft = {}): StudioWorkDraft {
  return {
    workName: "현재 작업",
    topicText: "topic",
    publishCategory: "alpha",
    ...overrides,
  };
}

test("buildPersonalV1ProjectIndex groups project versions by snapshot project id and prefers the current draft while counting it", () => {
  const snapshot = makeSnapshot("project-1");
  const index = buildPersonalV1ProjectIndex({
    drafts: [
      {
        category: "alpha",
        label: "Alpha 채널",
        title: "현재 제목",
        slideCount: 2,
        hasVideo: false,
        updatedAt: 10,
        draft: makeDraft({
          workName: "현재 제목",
          projectProfileSnapshot: snapshot,
          slides: [
            { title: "s1", text: "one", lines: ["one"], layout: "photo+body" },
            { title: "s2", text: "two", lines: ["two"], layout: "photo+body" },
          ],
        }),
      },
    ],
    history: [
      {
        id: "history-newer-than-draft",
        category: "alpha",
        label: "Alpha 채널",
        historyLabel: "이전 버전",
        createdAt: "2026-07-20T00:01:00.000Z",
        createdAtMs: 20,
        title: "이전 제목",
        slideCount: 1,
        changeTags: [],
        summary: "",
        draft: makeDraft({
          workName: "이전 제목",
          projectProfileSnapshot: snapshot,
          videoUrl: "https://example.com/old.mp4",
        }),
      },
    ],
  });

  assert.equal(index.length, 1);
  assert.equal(index[0].projectId, "project-1");
  assert.equal(index[0].source, "draft");
  assert.equal(index[0].historyId, null);
  assert.equal(index[0].title, "현재 제목");
  assert.equal(index[0].activityAt, 20);
  assert.equal(index[0].storedVersionCount, 2);
  assert.deepEqual(
    index[0].versions.map((version) => [version.source, version.historyId, version.label]),
    [
      ["draft", null, "현재 작업본"],
      ["history", "history-newer-than-draft", "이전 버전"],
    ]
  );
  assert.equal(index[0].versions[1].hasVideo, true);
  assert.equal(getPersonalV1ProjectIndexStatus(index[0]), "rendered");
  assert.equal(getPersonalV1ProjectIndexStatusLabel(index[0]), "완성 저장본 있음");
  assert.equal(index[0].slideCount, 2);
  assert.equal(index[0].stageLabel, "컷 편집 중");
});

test("sortPersonalV1ProjectIndexByRepresentativeActivity orders the home list by the version it opens", () => {
  const olderSnapshot = makeSnapshot("older-current");
  const newerSnapshot = makeSnapshot("newer-current");
  const index = buildPersonalV1ProjectIndex({
    drafts: [
      { category: "alpha", label: "Alpha 채널", updatedAt: 10, draft: makeDraft({ workName: "오래된 현재본", projectProfileSnapshot: olderSnapshot }) },
      { category: "alpha", label: "Alpha 채널", updatedAt: 20, draft: makeDraft({ workName: "새 현재본", projectProfileSnapshot: newerSnapshot }) },
    ],
    history: [
      {
        id: "new-history-on-old-current",
        category: "alpha",
        label: "Alpha 채널",
        historyLabel: "최근 저장본",
        createdAt: "2026-07-20T00:01:00.000Z",
        createdAtMs: 100,
        title: "최근 저장본",
        slideCount: 0,
        changeTags: [],
        summary: "",
        draft: makeDraft({ workName: "최근 저장본", projectProfileSnapshot: olderSnapshot }),
      },
    ],
  });

  assert.equal(index[0].title, "오래된 현재본");
  assert.deepEqual(
    sortPersonalV1ProjectIndexByRepresentativeActivity(index).map((item) => item.title),
    ["새 현재본", "오래된 현재본"]
  );
});

test("buildPersonalV1ProjectIndex does not group snapshots whose category conflicts with the supplied category", () => {
  const mismatchedSnapshot = makeSnapshot("shared-project", "beta", "Beta 채널");
  const matchedSnapshot = makeSnapshot("shared-project", "beta", "Beta 채널");
  const index = buildPersonalV1ProjectIndex({
    drafts: [
      {
        category: "alpha",
        label: "Alpha 채널",
        updatedAt: 10,
        draft: makeDraft({
          workName: "불일치 초안",
          publishCategory: "alpha",
          projectProfileSnapshot: mismatchedSnapshot,
        }),
      },
    ],
    history: [
      {
        id: "beta-history",
        category: "beta",
        label: "Beta 채널",
        historyLabel: "베타 기록",
        createdAt: "2026-07-20T00:01:00.000Z",
        createdAtMs: 20,
        title: "베타 기록",
        slideCount: 0,
        changeTags: [],
        summary: "",
        draft: makeDraft({
          workName: "베타 기록",
          publishCategory: "beta",
          projectProfileSnapshot: matchedSnapshot,
        }),
      },
    ],
  });

  assert.equal(index.length, 2);
  assert.deepEqual(
    index.map((item) => [item.category, item.projectId, item.storedVersionCount]),
    [
      ["beta", "shared-project", 1],
      ["alpha", "legacy-draft-alpha", 1],
    ]
  );
});

test("buildPersonalV1ProjectIndex keeps legacy history entries separated", () => {
  const index = buildPersonalV1ProjectIndex({
    history: [
      {
        id: "legacy-1",
        label: "legacy one",
        createdAt: "2026-07-20T00:00:00.000Z",
        draft: makeDraft({ workName: "동일 제목", projectProfileSnapshot: undefined }),
      },
      {
        id: "legacy-2",
        label: "legacy two",
        createdAt: "2026-07-20T00:01:00.000Z",
        draft: makeDraft({ workName: "동일 제목", projectProfileSnapshot: undefined }),
      },
    ],
  });

  assert.equal(index.length, 2);
  assert.deepEqual(
    index.map((item) => item.historyId),
    ["legacy-2", "legacy-1"]
  );
  assert.deepEqual(
    index.map((item) => item.storedVersionCount),
    [1, 1]
  );
});

test("calculatePersonalV1ProjectStageLabel follows failure, video, slides, json, script, input priority", () => {
  assert.equal(calculatePersonalV1ProjectStageLabel({ renderStatus: "render error", videoUrl: "https://example.com/v.mp4" }), "렌더 확인 필요");
  assert.equal(
    calculatePersonalV1ProjectStageLabel({ renderStatus: "2/3 최종 서버 렌더링 중", videoUrl: "https://example.com/v.mp4" }),
    "중단됨·재시도 필요"
  );
  assert.equal(calculatePersonalV1ProjectStageLabel({ videoUrl: "https://example.com/v.mp4", slides: [] }), "영상 생성 완료");
  assert.equal(calculatePersonalV1ProjectStageLabel({ slides: [{ title: "s", text: "t", lines: ["t"], layout: "photo+body" }] }), "컷 편집 중");
  assert.equal(calculatePersonalV1ProjectStageLabel({ jsonText: "{\"title\":\"json\"}", scriptText: "script" }), "JSON 정리 중");
  assert.equal(calculatePersonalV1ProjectStageLabel({ scriptText: "script", topicText: "topic" }), "대본 편집 중");
  assert.equal(calculatePersonalV1ProjectStageLabel({ topicText: "topic" }), "입력 준비");
});

test("project index surfaces interrupted persisted operations as attention before rendered state", () => {
  const [item] = buildPersonalV1ProjectIndex({
    drafts: [
      {
        category: "alpha",
        label: "Alpha 채널",
        updatedAt: 10,
        draft: makeDraft({
          workName: "중단된 최종 렌더",
          renderStatus: "3/3 최종 결과 반영 중",
          videoUrl: "https://example.com/draft.mp4",
          projectProfileSnapshot: makeSnapshot("interrupted-render"),
        }),
      },
    ],
  });

  assert.equal(item.stageLabel, "중단됨·재시도 필요");
  assert.equal(getPersonalV1ProjectIndexStatus(item), "attention");
  assert.equal(getPersonalV1ProjectIndexStatusLabel(item), "중단됨·재시도 필요");
});

test("project index keeps recovered interrupted operation statuses as attention after autosave", () => {
  const [item] = buildPersonalV1ProjectIndex({
    drafts: [
      {
        category: "alpha",
        label: "Alpha 채널",
        updatedAt: 10,
        draft: makeDraft({
          workName: "복구 상태가 저장된 작업",
          renderStatus: "최종 렌더 중단됨·재시도 필요. 같은 단계에서 다시 실행해 주세요.",
          videoUrl: "https://example.com/final.mp4",
          projectProfileSnapshot: makeSnapshot("recovered-interrupted-render"),
        }),
      },
    ],
  });

  assert.equal(item.stageLabel, "중단됨·재시도 필요");
  assert.equal(item.hasVideo, true);
  assert.equal(getPersonalV1ProjectIndexStatus(item), "attention");
  assert.equal(getPersonalV1ProjectIndexStatusLabel(item), "중단됨·재시도 필요");
});

test("filterPersonalV1ProjectIndex supports search, profile, and status filters", () => {
  const index = buildPersonalV1ProjectIndex({
    drafts: [
      {
        category: "alpha",
        label: "Alpha 채널",
        updatedAt: 30,
        draft: makeDraft({ workName: "렌더 실패", renderStatus: "failed", projectProfileSnapshot: makeSnapshot("project-a") }),
      },
      {
        category: "beta",
        label: "Beta 채널",
        updatedAt: 20,
        draft: makeDraft({
          workName: "완료 영상",
          publishCategory: "beta",
          videoUrl: "https://example.com/v.mp4",
          projectProfileSnapshot: makeSnapshot("project-b", "beta", "Beta 채널"),
        }),
      },
      {
        category: "gamma",
        label: "Gamma 채널",
        updatedAt: 10,
        draft: makeDraft({ workName: "진행 작업", publishCategory: "gamma", scriptText: "script" }),
      },
    ],
  });

  assert.deepEqual(
    filterPersonalV1ProjectIndex(index, { search: "완료" }).map((item) => item.title),
    ["완료 영상"]
  );
  assert.deepEqual(
    filterPersonalV1ProjectIndex(index, { profile: "beta" }).map((item) => item.category),
    ["beta"]
  );
  assert.deepEqual(
    filterPersonalV1ProjectIndex(index, { status: "attention" }).map((item) => getPersonalV1ProjectIndexStatus(item)),
    ["attention"]
  );
  assert.deepEqual(
    filterPersonalV1ProjectIndex(index, { status: "rendered" }).map((item) => item.title),
    ["완료 영상"]
  );
  assert.deepEqual(
    filterPersonalV1ProjectIndex(index, { status: "in_progress" }).map((item) => item.title),
    ["진행 작업"]
  );
});

test("filterPersonalV1ProjectIndex searches stored-version labels and status, not only the current draft", () => {
  const snapshot = makeSnapshot("search-history-project");
  const index = buildPersonalV1ProjectIndex({
    drafts: [{ category: "alpha", label: "Alpha 채널", updatedAt: 20, draft: makeDraft({ workName: "현재 초안", projectProfileSnapshot: snapshot }) }],
    history: [
      {
        id: "rendered-history",
        category: "alpha",
        label: "Alpha 채널",
        historyLabel: "최종 확인본 보관",
        createdAt: "2026-07-20T00:00:00.000Z",
        createdAtMs: 10,
        title: "완료 버전 제목",
        slideCount: 0,
        changeTags: [],
        summary: "",
        draft: makeDraft({ workName: "완료 버전 제목", videoUrl: "https://example.com/final.mp4", projectProfileSnapshot: snapshot }),
      },
    ],
  });

  assert.deepEqual(filterPersonalV1ProjectIndex(index, { search: "최종 확인본" }).map((item) => item.title), ["현재 초안"]);
  assert.deepEqual(filterPersonalV1ProjectIndex(index, { search: "완료 버전 제목" }).map((item) => item.title), ["현재 초안"]);
  assert.deepEqual(filterPersonalV1ProjectIndex(index, { status: "rendered" }).map((item) => item.title), ["현재 초안"]);
});

test("resolvePersonalV1ProjectIndexVersion returns the requested history and safely falls back to the current draft", () => {
  const snapshot = makeSnapshot("version-project");
  const [project] = buildPersonalV1ProjectIndex({
    drafts: [{ category: "alpha", label: "Alpha 채널", updatedAt: 20, draft: makeDraft({ projectProfileSnapshot: snapshot }) }],
    history: [
      {
        id: "history-choice",
        category: "alpha",
        label: "Alpha 채널",
        historyLabel: "선택할 저장본",
        createdAt: "2026-07-20T00:00:00.000Z",
        createdAtMs: 10,
        title: "이전 제목",
        slideCount: 0,
        changeTags: [],
        summary: "",
        draft: makeDraft({ workName: "이전 제목", projectProfileSnapshot: snapshot }),
      },
    ],
  });

  assert.equal(resolvePersonalV1ProjectIndexVersion(project, "history:history-choice")?.historyId, "history-choice");
  assert.equal(resolvePersonalV1ProjectIndexVersion(project, "missing")?.source, "draft");
});

test("buildPersonalV1ProjectCloneDraft strips output state and stores a new project snapshot", () => {
  const source = makeDraft({
    workName: "원본",
    publishCategory: "alpha",
    videoUrl: "https://example.com/final.mp4",
    uploadedVideoUrl: "https://example.com/upload.mp4",
    renderStatus: "done",
    lastDraftRenderFingerprint: "draft-fp",
    lastFinalRenderFingerprint: "final-fp",
    lastRenderPreflightFingerprint: "preflight-fp",
    voiceApprovalFingerprint: "voice-fp",
    imageApprovalFingerprint: "image-fp",
    quickScheduledAt: "2026-07-21T00:00:00.000Z",
    projectProfileSnapshot: makeSnapshot("old-project"),
  });
  const nextSnapshot = makeSnapshot("new-project", "beta", "Beta 채널");
  const draft = buildPersonalV1ProjectCloneDraft({
    source,
    projectProfileSnapshot: nextSnapshot,
    name: "x".repeat(200),
  });

  assert.equal(draft.workName?.length, 120);
  assert.equal(draft.publishCategory, "beta");
  assert.equal(draft.projectProfileSnapshot?.projectId, "new-project");
  assert.equal(draft.videoUrl, undefined);
  assert.equal(draft.uploadedVideoUrl, undefined);
  assert.equal(draft.renderStatus, undefined);
  assert.equal(draft.lastDraftRenderFingerprint, undefined);
  assert.equal(draft.lastFinalRenderFingerprint, undefined);
  assert.equal(draft.lastRenderPreflightFingerprint, undefined);
  assert.equal(draft.voiceApprovalFingerprint, undefined);
  assert.equal(draft.imageApprovalFingerprint, undefined);
  assert.equal(draft.quickScheduledAt, undefined);

  nextSnapshot.contentProfile.label = "mutated";
  assert.equal(draft.projectProfileSnapshot?.contentProfile.label, "Beta 채널");
});

test("buildPersonalV1ProjectCloneName preserves the copy suffix inside the 120 character limit", () => {
  const cloneName = buildPersonalV1ProjectCloneName("원본".repeat(100));

  assert.equal(cloneName.length, 120);
  assert.match(cloneName, / 복사본$/);
});
