"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  readStoredStudioDraft,
  readStoredStudioHistory,
  setStoredStudioHistoryActiveId,
  STUDIO_LAST_PUBLISH_CATEGORY_KEY,
  writeStoredStudioDraft,
  writeStoredStudioHistory,
} from "@/app/shorts-json-studio/storage";
import {
  buildPersonalV1HistoryArchiveEntryBeforeOverwrite,
  buildPersonalV1StudioWorkDraftSeed,
} from "@/lib/personal-v1/studio-dashboard-helpers";
import { fetchPublishWorkspaceSnapshot, type PublishWorkspaceSnapshot } from "@/lib/api/publish-workspace-client";
import { createStudioProjectProfileSnapshot } from "@/lib/studio/project-profile-snapshot";
import { writeScopedStorage } from "@/lib/ui/scoped-storage";
import styles from "@/styles/personal-v1.module.css";
import { createPersonalV1ProjectContext, writePersonalV1ProjectContext } from "./project-context-storage";
import { buildNewProjectProfileSummary } from "./profile-summary";

type InputMode = "topic" | "script";

function toProfileLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /status\s*5\d\d|json 형식|failed to fetch|econnrefused/i.test(message)) {
    return "로컬 콘텐츠 프로필에 연결하지 못했습니다. 데이터 서비스 실행 상태를 확인해 주세요.";
  }
  return message;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [snapshot, setSnapshot] = useState<PublishWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("script");
  const [inputText, setInputText] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void fetchPublishWorkspaceSnapshot()
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(toProfileLoadError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProfile = useMemo(
    () => snapshot?.categoryOptions.find((item) => item.key === selectedCategory) || null,
    [selectedCategory, snapshot]
  );
  const selectedMetadata = selectedCategory ? snapshot?.categoryMetadataMap[selectedCategory] || null : null;
  const selectedProfileDefaults = useMemo(
    () =>
      selectedProfile
        ? buildNewProjectProfileSummary(selectedMetadata, { storageReady: snapshot?.storageReady })
        : null,
    [selectedMetadata, selectedProfile, snapshot?.storageReady]
  );
  const selectedChannelId = selectedCategory ? snapshot?.categoryChannels[selectedCategory] || "" : "";
  const selectedChannel = selectedChannelId
    ? snapshot?.accounts.find((item) => item.channelId === selectedChannelId) || null
    : null;
  const canMoveNext = Boolean(selectedProfile);
  const canCreate = Boolean(selectedProfile && inputText.trim() && !submitting);

  const createProject = () => {
    if (!selectedProfile) {
      setSubmitError("콘텐츠 프로필을 먼저 선택해 주세요.");
      return;
    }
    if (!inputText.trim()) {
      setSubmitError(inputMode === "topic" ? "영상 주제를 입력해 주세요." : "완성된 대본을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const category = selectedProfile.key;
      const context = createPersonalV1ProjectContext({
        category,
        profileLabel: selectedProfile.label,
        metadataSnapshot: selectedMetadata,
        inputMode,
        originalText: inputText.trim(),
      });
      const projectProfileSnapshot = createStudioProjectProfileSnapshot(context);
      const nextDraft = buildPersonalV1StudioWorkDraftSeed({
        contentProfile: {
          category,
          label: selectedProfile.label,
        },
        inputMode,
        text: inputText,
        metadataSnapshot: selectedMetadata,
        projectProfileSnapshot,
      });
      const existingDraft = readStoredStudioDraft(category);
      const archiveEntry = buildPersonalV1HistoryArchiveEntryBeforeOverwrite({
        currentDraft: existingDraft,
        nextDraft,
        category,
        categoryLabel: selectedProfile.label,
      });
      if (archiveEntry) {
        const currentHistory = readStoredStudioHistory(category);
        writeStoredStudioHistory(category, {
          activeHistoryId: currentHistory.activeHistoryId,
          historyEntries: [archiveEntry, ...currentHistory.historyEntries.filter((entry) => entry.id !== archiveEntry.id)],
        });
      }

      writePersonalV1ProjectContext(context);
      writeStoredStudioDraft(category, nextDraft);
      setStoredStudioHistoryActiveId(category, null);
      writeScopedStorage(STUDIO_LAST_PUBLISH_CATEGORY_KEY, category);
      router.push("/shorts-json-studio?mode=onboarding");
    } catch (error) {
      setSubmitting(false);
      setSubmitError(error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다.");
    }
  };

  return (
    <AppLayout>
      <div className={`${styles.page} ${styles.wizardShell}`}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <h1 className={styles.pageTitle}>새 프로젝트</h1>
          </div>
          <Link href="/home" className={styles.ghostButton}>취소</Link>
        </header>

        <ol className={styles.wizardProgress} aria-label="새 프로젝트 진행 단계">
          <li className={`${styles.wizardStep} ${step === 1 ? styles.wizardStepActive : styles.wizardStepComplete}`} aria-current={step === 1 ? "step" : undefined}>
            <span className={styles.stepNumber}>{step === 2 ? "✓" : "1"}</span>
            콘텐츠 프로필 선택
          </li>
          <li className={`${styles.wizardStep} ${step === 2 ? styles.wizardStepActive : ""}`} aria-current={step === 2 ? "step" : undefined}>
            <span className={styles.stepNumber}>2</span>
            시작 방식 선택
          </li>
        </ol>

        <section className={`${styles.card} ${styles.wizardCard}`}>
          {step === 1 ? (
            <div className={styles.wizardContent}>
              <h2 className={styles.sectionHeading}>콘텐츠 프로필 선택</h2>

              {loading ? (
                <div className={styles.loadingState} role="status"><p>콘텐츠 프로필을 불러오는 중입니다.</p></div>
              ) : loadError ? (
                <div className={styles.errorState} role="alert">
                  <strong>프로필을 불러오지 못했습니다.</strong>
                  <p>{loadError}</p>
                </div>
              ) : snapshot && snapshot.categoryOptions.length > 0 ? (
                <div
                  className={`${styles.profileSelectionLayout} ${
                    selectedProfile ? "" : styles.profileSelectionLayoutSingle
                  }`}
                >
                  <div className={`${styles.profileGrid} ${styles.profileSelectionList}`}>
                    {snapshot.categoryOptions.map((profile) => {
                      const metadata = snapshot.categoryMetadataMap[profile.key];
                      const profileDefaults = buildNewProjectProfileSummary(metadata, {
                        storageReady: snapshot.storageReady,
                      });
                      const channelId = snapshot.categoryChannels[profile.key] || "";
                      const channel = snapshot.accounts.find((item) => item.channelId === channelId);
                      const selected = profile.key === selectedCategory;
                      return (
                        <button
                          key={profile.key}
                          type="button"
                          className={`${styles.selectCard} ${selected ? styles.selectCardSelected : ""}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedCategory(profile.key);
                            setSubmitError("");
                          }}
                        >
                          {selected ? <span className={styles.selectionMark} aria-hidden="true">✓</span> : null}
                          <span className={styles.selectCardTitle}>{profile.label}</span>
                          <span className={styles.selectCardMeta}>{channel ? `연결 채널 · ${channel.channelTitle}` : "연결 채널 없음"}</span>
                          {!profileDefaults.hasDefaultVoice || !profileDefaults.hasRequiredStorage ? (
                            <span className={styles.profileRequirements}>
                              {!profileDefaults.hasDefaultVoice ? (
                                <span className={styles.requirementChip}>음성 설정 필요</span>
                              ) : null}
                              {!profileDefaults.hasRequiredStorage ? (
                                <span className={styles.requirementChip}>저장소 확인 필요</span>
                              ) : null}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {selectedProfile && selectedProfileDefaults ? (
                    <aside className={styles.profileSummaryCard} aria-live="polite" aria-label="선택한 프로필 기본값">
                      <p className={styles.profileSummaryEyebrow}>선택한 기본값</p>
                        <div className={styles.profileSummaryHeading}>
                          <h3>{selectedProfile.label}</h3>
                          <span>{selectedChannel ? `연결 채널 · ${selectedChannel.channelTitle}` : "연결 채널 없음"}</span>
                        </div>
                        <dl className={styles.profileSummaryList}>
                          <div><dt>출력</dt><dd>{selectedProfileDefaults.outputFormat}</dd></div>
                          <div><dt>템플릿</dt><dd>{selectedProfileDefaults.template}</dd></div>
                          <div><dt>기본 보이스</dt><dd>{selectedProfileDefaults.defaultVoice}</dd></div>
                          <div><dt>기본 배속</dt><dd>{selectedProfileDefaults.playbackRate}</dd></div>
                          <div><dt>BGM</dt><dd>{selectedProfileDefaults.bgm}</dd></div>
                          <div><dt>효과음</dt><dd>{selectedProfileDefaults.sfx}</dd></div>
                          <div><dt>이미지 스타일</dt><dd>{selectedProfileDefaults.imageStyle}</dd></div>
                        </dl>
                        {!selectedProfileDefaults.hasDefaultVoice ? (
                          <p className={styles.profileSummaryWarning}>
                            기본 보이스가 비어 있습니다. 제작 단계에서 선택하거나 <Link href="/settings?tab=contentProfile">프로필에서 설정</Link>해 주세요.
                          </p>
                        ) : null}
                        {!selectedProfileDefaults.hasRequiredStorage ? (
                          <p className={styles.profileSummaryWarning}>
                            미디어 저장소가 준비되지 않았습니다. 이미지 업로드와 완성 영상 보관 전에 <Link href="/settings?tab=storageRecovery">저장소 설정을 확인</Link>해 주세요.
                          </p>
                        ) : null}
                        <details className={styles.inlineHelp}>
                          <summary>기본값 적용 방식</summary>
                          <p>
                            프로젝트를 만들 때 현재 기본값을 복사합니다. 이후 프로필을 수정해도 이미 만든
                            프로젝트는 자동으로 바뀌지 않습니다.
                          </p>
                        </details>
                    </aside>
                  ) : null}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <strong>사용할 콘텐츠 프로필이 없습니다.</strong>
                </div>
              )}

              <div className={styles.wizardActions}>
                <Link href="/settings?tab=contentProfile" className={styles.secondaryButton}>프로필 관리</Link>
                <div className={styles.wizardActionsEnd}>
                  {!loading && !loadError && !canMoveNext ? (
                    <p className={styles.disabledReason}>
                      {snapshot?.categoryOptions.length ? "계속하려면 프로필을 하나 선택해 주세요." : "먼저 사용할 프로필을 만들어 주세요."}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!canMoveNext}
                    onClick={() => setStep(2)}
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.wizardContent}>
              <h2 className={styles.sectionHeading}>시작 방식 선택</h2>

              <div className={styles.selectedProfileSummary}>
                <p>선택한 프로필 · <strong>{selectedProfile?.label}</strong></p>
                <button type="button" className={styles.ghostButton} onClick={() => setStep(1)}>변경</button>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>시작 방식</span>
                  <div className={styles.segmentControl} aria-label="시작 방식">
                    <button type="button" className={`${styles.segmentButton} ${inputMode === "topic" ? styles.segmentButtonActive : ""}`} aria-pressed={inputMode === "topic"} onClick={() => { setInputMode("topic"); setSubmitError(""); }}>
                      주제로 시작
                    </button>
                    <button type="button" className={`${styles.segmentButton} ${inputMode === "script" ? styles.segmentButtonActive : ""}`} aria-pressed={inputMode === "script"} onClick={() => { setInputMode("script"); setSubmitError(""); }}>
                      완성 대본으로 시작
                    </button>
                  </div>
                </div>

                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>{inputMode === "topic" ? "영상 주제" : "전체 대본"}</span>
                  <textarea className={styles.textArea} value={inputText} autoFocus placeholder={inputMode === "topic" ? "첫 줄이 프로젝트 이름으로 사용됩니다. 다루고 싶은 주제와 관점을 적어 주세요." : "첫 줄이 프로젝트 이름으로 사용됩니다. 그 아래에 완성 대본을 붙여 넣어 주세요."} onChange={(event) => { setInputText(event.target.value); setSubmitError(""); }} />
                </label>
              </div>

              {submitError ? <p className={styles.inlineError} role="alert">{submitError}</p> : null}

              <div className={styles.wizardActions}>
                <button type="button" className={styles.secondaryButton} disabled={submitting} onClick={() => setStep(1)}>이전</button>
                <div className={styles.wizardActionsEnd}>
                  {!canCreate && !submitting ? (
                    <p className={styles.disabledReason}>
                      {inputMode === "topic" ? "주제를" : "대본을"} 입력해 주세요.
                    </p>
                  ) : null}
                  <button type="button" className={styles.primaryButton} disabled={!canCreate} onClick={createProject}>
                    {submitting ? "프로젝트 만드는 중..." : "프로젝트 만들고 제작 시작"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
