import type { PublishMetadata } from "@/lib/publish/category-metadata";
import type { PublishCategory } from "@/lib/publish/types";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";

const PERSONAL_V1_PROJECT_CONTEXT_STORAGE_KEY = "personal-v1-project-context-v1";

export type PersonalV1ProjectContext = {
  version: 1;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  contentProfile: {
    category: PublishCategory;
    label: string;
    metadataSnapshot: PublishMetadata | null;
  };
  input: {
    mode: "topic" | "script";
    originalText: string;
  };
};

function toCategoryContextKey(category: PublishCategory): string {
  return `${PERSONAL_V1_PROJECT_CONTEXT_STORAGE_KEY}:${category}`;
}

function createProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneMetadata(metadata: PublishMetadata | null | undefined): PublishMetadata | null {
  if (!metadata) return null;
  if (typeof structuredClone === "function") return structuredClone(metadata);
  return JSON.parse(JSON.stringify(metadata)) as PublishMetadata;
}

export function createPersonalV1ProjectContext(input: {
  category: PublishCategory;
  profileLabel: string;
  metadataSnapshot?: PublishMetadata | null;
  inputMode: "topic" | "script";
  originalText: string;
  now?: string;
}): PersonalV1ProjectContext {
  const now = input.now || new Date().toISOString();
  return {
    version: 1,
    projectId: createProjectId(),
    createdAt: now,
    updatedAt: now,
    contentProfile: {
      category: input.category,
      label: input.profileLabel,
      metadataSnapshot: cloneMetadata(input.metadataSnapshot),
    },
    input: {
      mode: input.inputMode,
      originalText: input.originalText,
    },
  };
}

export function writePersonalV1ProjectContext(context: PersonalV1ProjectContext): void {
  writeScopedStorage(toCategoryContextKey(context.contentProfile.category), JSON.stringify(context));
}

export function readPersonalV1ProjectContext(category: PublishCategory): PersonalV1ProjectContext | null {
  const raw = readScopedStorage(toCategoryContextKey(category));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PersonalV1ProjectContext;
    if (value?.version !== 1 || value?.contentProfile?.category !== category) return null;
    return value;
  } catch {
    return null;
  }
}
