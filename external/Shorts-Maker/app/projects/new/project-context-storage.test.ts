import assert from "node:assert/strict";
import test from "node:test";
import { getPublishMetadata } from "@/lib/publish/category-metadata";
import { createStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { createPersonalV1ProjectContext } from "./project-context-storage";

test("createPersonalV1ProjectContext keeps an immutable profile snapshot", () => {
  const metadata = {
    ...getPublishMetadata("default"),
    tags: ["원본 태그"],
  };
  const context = createPersonalV1ProjectContext({
    category: "news",
    profileLabel: "뉴스 브리핑",
    metadataSnapshot: metadata,
    inputMode: "topic",
    originalText: "  이번 주 핵심 뉴스  ",
    now: "2026-07-19T12:00:00.000Z",
  });

  assert.equal(context.version, 1);
  assert.equal(context.createdAt, "2026-07-19T12:00:00.000Z");
  assert.equal(context.updatedAt, "2026-07-19T12:00:00.000Z");
  assert.equal(context.contentProfile.category, "news");
  assert.equal(context.contentProfile.label, "뉴스 브리핑");
  assert.equal(context.input.mode, "topic");
  assert.equal(context.input.originalText, "  이번 주 핵심 뉴스  ");

  metadata.tags.push("나중 변경");
  assert.deepEqual(context.contentProfile.metadataSnapshot?.tags, ["원본 태그"]);
});

test("project context creates a matching draft profile snapshot", () => {
  const context = createPersonalV1ProjectContext({
    category: "news",
    profileLabel: "뉴스 브리핑",
    metadataSnapshot: getPublishMetadata("news"),
    inputMode: "script",
    originalText: "대본",
    now: "2026-07-19T12:00:00.000Z",
  });
  const snapshot = createStudioProjectProfileSnapshot(context);

  assert.equal(snapshot.projectId, context.projectId);
  assert.equal(snapshot.createdAt, context.createdAt);
  assert.equal(snapshot.contentProfile.category, context.contentProfile.category);
  assert.equal(snapshot.contentProfile.label, context.contentProfile.label);
});
