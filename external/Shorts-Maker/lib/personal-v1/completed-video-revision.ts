import type { StudioWorkDraft } from "@/app/shorts-json-studio/types";
import {
  createPersonalV1ProjectContext,
  type PersonalV1ProjectContext,
} from "@/app/projects/new/project-context-storage";
import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import {
  createStudioProjectProfileSnapshot,
  type StudioProjectProfileSnapshot,
} from "@/lib/studio/project-profile-snapshot";
import { buildPersonalV1ProjectCloneDraft } from "./studio-project-index";

export type PersonalV1CompletedVideoRevisionInput = {
  sourceDraft: StudioWorkDraft | null | undefined;
  category: PublishCategory;
  profileLabel: string;
  categoryMetadata?: PublishMetadata | null;
  now?: string;
  name?: string;
};

export type PersonalV1CompletedVideoRevision = {
  context: PersonalV1ProjectContext;
  projectProfileSnapshot: StudioProjectProfileSnapshot;
  draft: StudioWorkDraft;
};

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasEditableSourceContent(draft: StudioWorkDraft): boolean {
  if (trimString(draft.topicText)) return true;
  if (trimString(draft.scriptText)) return true;
  if (trimString(draft.jsonText)) return true;
  if (Array.isArray(draft.slides) && draft.slides.length > 0) return true;
  return false;
}

function resolveRevisionMetadataSnapshot(input: {
  sourceDraft: StudioWorkDraft;
  category: PublishCategory;
  categoryMetadata?: PublishMetadata | null;
}): PublishMetadata | null {
  const sourceSnapshot = input.sourceDraft.projectProfileSnapshot;
  if (sourceSnapshot?.contentProfile.category === input.category && sourceSnapshot.contentProfile.metadataSnapshot) {
    return sourceSnapshot.contentProfile.metadataSnapshot;
  }
  return input.categoryMetadata || null;
}

export function buildPersonalV1CompletedVideoRevision(
  input: PersonalV1CompletedVideoRevisionInput
): PersonalV1CompletedVideoRevision {
  const category = trimString(input.category);
  if (!category) throw new Error("수정본을 만들 콘텐츠 프로필이 없습니다.");

  const profileLabel = trimString(input.profileLabel);
  if (!profileLabel) throw new Error("수정본을 만들 콘텐츠 프로필 이름이 없습니다.");

  const sourceDraft = input.sourceDraft;
  if (!sourceDraft || !hasEditableSourceContent(sourceDraft)) {
    throw new Error("수정본을 만들 제작 내용이 없습니다.");
  }

  const topicText = trimString(sourceDraft.topicText);
  const scriptText = trimString(sourceDraft.scriptText);
  const context = createPersonalV1ProjectContext({
    category,
    profileLabel,
    metadataSnapshot: resolveRevisionMetadataSnapshot({
      sourceDraft,
      category,
      categoryMetadata: input.categoryMetadata,
    }),
    inputMode: topicText ? "topic" : "script",
    originalText: topicText || scriptText,
    now: input.now,
  });
  const projectProfileSnapshot = createStudioProjectProfileSnapshot(context);
  const draft = buildPersonalV1ProjectCloneDraft({
    source: sourceDraft,
    projectProfileSnapshot,
    name: input.name,
  });

  return {
    context,
    projectProfileSnapshot,
    draft,
  };
}
