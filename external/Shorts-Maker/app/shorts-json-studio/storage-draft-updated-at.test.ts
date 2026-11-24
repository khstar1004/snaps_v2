import assert from "node:assert/strict";
import test from "node:test";
import {
  getStudioDraftScopedStorageKey,
  getStudioHistoryScopedStorageKey,
  listStoredStudioDraftCategories,
  readStoredStudioDraft,
  readStoredStudioDraftUpdatedAt,
  readStoredStudioHistory,
  removeStoredStudioDraft,
  writeStoredStudioDraft,
  writeStoredStudioHistory,
} from "./storage";

function makeStorageMock() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
      key(index: number) {
        return Array.from(store.keys())[index] || null;
      },
      get length() {
        return store.size;
      },
    } as Storage,
  };
}

test("stored studio drafts track an honest last-save timestamp", () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalDocument = (globalThis as typeof globalThis & { document?: unknown }).document;
  const memory = makeStorageMock();
  const before = Date.now();

  try {
    (globalThis as any).window = { localStorage: memory.localStorage };
    (globalThis as any).document = { cookie: "" };

    writeStoredStudioDraft("news", { workName: "저장 시각 테스트", publishCategory: "news" });
    const updatedAt = readStoredStudioDraftUpdatedAt("news");
    assert.ok(updatedAt >= before);
    assert.ok(updatedAt <= Date.now());

    removeStoredStudioDraft("news");
    assert.equal(readStoredStudioDraftUpdatedAt("news"), 0);
  } finally {
    if (typeof originalWindow === "undefined") delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (typeof originalDocument === "undefined") delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
  }
});

test("stored studio draft categories include local drafts that no longer appear in profile options", () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalDocument = (globalThis as typeof globalThis & { document?: unknown }).document;
  const memory = makeStorageMock();

  try {
    (globalThis as any).window = { localStorage: memory.localStorage };
    (globalThis as any).document = { cookie: "" };

    writeStoredStudioDraft("orphan-profile", { workName: "보관 프로젝트", publishCategory: "orphan-profile" });
    writeStoredStudioDraft("active-profile", { workName: "현재 프로젝트", publishCategory: "active-profile" });

    assert.deepEqual(listStoredStudioDraftCategories(), ["active-profile", "orphan-profile"]);

    removeStoredStudioDraft("orphan-profile");
    assert.deepEqual(listStoredStudioDraftCategories(), ["active-profile"]);
  } finally {
    if (typeof originalWindow === "undefined") delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (typeof originalDocument === "undefined") delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
  }
});

test("stored studio drafts and history rebase local-storage URLs without rewriting stored data", () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalDocument = (globalThis as typeof globalThis & { document?: unknown }).document;
  const memory = makeStorageMock();
  const storedOrigin = "http://localhost:3000";
  const currentOrigin = "http://localhost:4100";
  const localImageUrl = `${storedOrigin}/api/local-storage/video-assets/generated.png`;
  const localAnchorUrl = `${storedOrigin}/api/local-storage/video-assets/anchor.png`;
  const externalUrl = "https://cdn.example.com/approved.png";
  const draft = {
    publishCategory: "news",
    slides: [
      {
        title: "주소 복원",
        text: "본문",
        lines: ["본문"],
        layout: "photo+body" as const,
        manualImagePrompt: {
          source: "codex" as const,
          mascotName: "캐릭터",
          basePrompt: "base",
          scenePrompt: "scene",
          finalPrompt: "final",
          anchorImageUrl: localAnchorUrl,
          usesFallbackMascot: false,
        },
        imageSelection: {
          intent: "fallback" as const,
          queryCandidates: [],
          selectedQuery: "",
          provider: "library" as const,
          providerCandidates: ["library" as const],
          candidateOptions: [
            {
              provider: "library" as const,
              candidateId: "local-candidate",
              imageUrl: localImageUrl,
            },
            {
              provider: "naver" as const,
              candidateId: "external-candidate",
              imageUrl: externalUrl,
            },
          ],
          selectionReason: "saved candidates",
        },
      },
    ],
  };

  try {
    (globalThis as any).window = {
      localStorage: memory.localStorage,
      location: { origin: currentOrigin },
    };
    (globalThis as any).document = { cookie: "" };

    writeStoredStudioDraft("news", draft);
    writeStoredStudioHistory("news", {
      activeHistoryId: "history-1",
      historyEntries: [
        {
          id: "history-1",
          label: "주소 복원 이력",
          createdAt: "2026-07-31T00:00:00.000Z",
          draft,
        },
      ],
    });

    const draftKey = getStudioDraftScopedStorageKey("news");
    const historyKey = getStudioHistoryScopedStorageKey("news");
    const rawDraftBeforeRead = memory.localStorage.getItem(draftKey);
    const rawHistoryBeforeRead = memory.localStorage.getItem(historyKey);
    const restoredDraft = readStoredStudioDraft("news");
    const restoredHistory = readStoredStudioHistory("news");

    assert.equal(
      restoredDraft?.slides?.[0]?.imageSelection?.candidateOptions?.[0]?.imageUrl,
      `${currentOrigin}/api/local-storage/video-assets/generated.png`
    );
    assert.equal(
      restoredDraft?.slides?.[0]?.manualImagePrompt?.anchorImageUrl,
      `${currentOrigin}/api/local-storage/video-assets/anchor.png`
    );
    assert.equal(restoredDraft?.slides?.[0]?.imageSelection?.candidateOptions?.[1]?.imageUrl, externalUrl);
    assert.equal(
      restoredHistory.historyEntries[0]?.draft.slides?.[0]?.imageSelection?.candidateOptions?.[0]?.imageUrl,
      `${currentOrigin}/api/local-storage/video-assets/generated.png`
    );
    assert.equal(memory.localStorage.getItem(draftKey), rawDraftBeforeRead);
    assert.equal(memory.localStorage.getItem(historyKey), rawHistoryBeforeRead);
  } finally {
    if (typeof originalWindow === "undefined") delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (typeof originalDocument === "undefined") delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = originalDocument;
  }
});
