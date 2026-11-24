"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchStudioEmailAddressBook,
  requestStudioEmailSend,
  saveStudioEmailAddressBookEntries,
} from "@/lib/api/studio-client";
import type { StudioSfxAutoLevel } from "@/lib/studio/sfx-auto-tuning";
import {
  STUDIO_EMAIL_ADDRESS_BOOK_LIMIT,
  STUDIO_EMAIL_QUICK_RECIPIENTS,
  isValidStudioEmailAddress,
  normalizeStudioEmailAddress,
  resolveStudioEmailLabel,
  type StudioEmailAddressBookEntry,
} from "@/lib/studio/email-address-book-shared";
import { readScopedStorage, writeScopedStorage } from "@/lib/ui/scoped-storage";
import { StudioRemotionPlayerPreview } from "./studio-remotion-preview";
import { StudioRenderPreflightPanel } from "./studio-render-preflight-panel";
import type { PreparedSlide } from "@/types/studio-json";
import type { StudioRenderPreflightIssue, StudioRenderPreflightSummary } from "../studio-render-preflight";
import type { StudioRenderPrimaryAction } from "../use-studio-render-publish-view-model";
import type { StudioTemplateId, StudioTemplatePayload, TemplateBranding, TemplateImageLayout, TemplateLayoutApply } from "../types";

const STUDIO_EMAIL_ADDRESS_BOOK_KEY = "studio-email-address-book-v1";
const EMAIL_RECIPIENT_SPLIT_REGEX = /\s*,\s*/;

type AddressBookEntry = StudioEmailAddressBookEntry;
type StudioResultKind = "draft" | "final";

function parseEmailRecipients(value: string): { recipients: string[]; invalidRecipients: string[] } {
  const tokens = value
    .split(EMAIL_RECIPIENT_SPLIT_REGEX)
    .map((item) => normalizeStudioEmailAddress(item))
    .filter(Boolean);
  const uniqueRecipients = tokens.filter((item, index) => tokens.indexOf(item) === index);
  return {
    recipients: uniqueRecipients.filter(isValidStudioEmailAddress),
    invalidRecipients: uniqueRecipients.filter((item) => !isValidStudioEmailAddress(item)),
  };
}

function sortAddressBookEntries(entries: AddressBookEntry[]): AddressBookEntry[] {
  return [...entries].sort((left, right) => {
    if (left.updatedAtMs !== right.updatedAtMs) return right.updatedAtMs - left.updatedAtMs;
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    return left.email.localeCompare(right.email);
  });
}

function normalizeStoredAddressBookEntry(value: unknown): AddressBookEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<AddressBookEntry> & { createdAt?: number; updatedAt?: number };
  const email = normalizeStudioEmailAddress(String(row.email || ""));
  if (!isValidStudioEmailAddress(email)) return null;
  const createdAtMs = Number(row.createdAtMs ?? row.createdAt) || Date.now();
  const updatedAtMs = Number(row.updatedAtMs ?? row.updatedAt) || createdAtMs;
  return {
    email,
    label: resolveStudioEmailLabel(email, String(row.label || "")),
    createdAtMs,
    updatedAtMs,
  };
}

function mergeAddressBookEntries(existing: AddressBookEntry[], entries: Array<{ email: string; label?: string }>): AddressBookEntry[] {
  const nextMap = new Map(existing.map((item) => [item.email, item] as const));
  const now = Date.now();
  for (const item of entries) {
    const email = item.email;
    const current = nextMap.get(email);
    nextMap.set(email, {
      email,
      label: resolveStudioEmailLabel(email, item.label || current?.label),
      createdAtMs: current?.createdAtMs || now,
      updatedAtMs: now,
    });
  }
  return sortAddressBookEntries(Array.from(nextMap.values())).slice(0, STUDIO_EMAIL_ADDRESS_BOOK_LIMIT);
}

function appendEmailRecipient(currentValue: string, nextEmail: string): string {
  const { recipients } = parseEmailRecipients(currentValue);
  if (recipients.includes(nextEmail)) {
    return recipients.join(", ");
  }
  return [...recipients, nextEmail].join(", ");
}

type StudioResultPanelProps = {
  panelHeading?: string;
  videoUrl: string | null;
  hasPreparedSlides: boolean;
  uploadedVideoUrl: string | null;
  downloadFileName: string;
  previewPlayerSlides: PreparedSlide[];
  previewPlayerFrameDurations?: number[];
  branding: TemplateBranding;
  templateId: StudioTemplateId;
  templateData?: StudioTemplatePayload;
  templateImageEnabled: boolean;
  templateImageUrl: string;
  templateImageLayout: TemplateImageLayout;
  templateLayoutApply: TemplateLayoutApply;
  busy: boolean;
  playbackRate: number;
  bgmEnabled: boolean;
  selectedBgmTrack: string;
  bgmVolume: number;
  mixPresetId: string;
  sfxEnabled: boolean;
  sfxMasterGainDb: number;
  sfxAutoLevel: StudioSfxAutoLevel;
  renderButtonLabel: string;
  renderStageLabel: string;
  renderStageDescription: string;
  renderStatus: string;
  renderDisabledReason?: string | null;
  renderPreflightSummary: StudioRenderPreflightSummary;
  renderPreflightHasRun: boolean;
  showRenderPreflight?: boolean;
  renderPrimaryAction: StudioRenderPrimaryAction;
  draftIsCurrent: boolean;
  finalIsCurrent: boolean;
  canEditSelectedCategory?: boolean;
  editPermissionMessage?: string;
  emailTitle: string;
  onRenderAction: () => void;
  onRenderDraftAction?: () => void;
  onRunRenderPreflightAction: () => void;
  onRenderPreflightIssueFixAction?: (issue: StudioRenderPreflightIssue) => void;
  onAutoPlanSfxAction: () => void;
  onPlaybackRateChangeAction: (value: number) => void;
  onBgmEnabledChangeAction: (checked: boolean) => void;
  onBgmTrackChangeAction: (value: string) => void;
  onBgmVolumeChangeAction: (value: number) => void;
  onMixPresetChangeAction: (value: string) => void;
  onSfxEnabledChangeAction: (checked: boolean) => void;
  onSfxMasterGainChangeAction: (value: number) => void;
  onSfxAutoLevelChangeAction: (value: StudioSfxAutoLevel) => void;
  onOpenLayoutStudioAction: () => void;
};

export function StudioResultPanel({
  videoUrl,
  hasPreparedSlides,
  uploadedVideoUrl,
  downloadFileName,
  previewPlayerSlides,
  previewPlayerFrameDurations,
  branding,
  templateId,
  templateData,
  templateImageEnabled,
  templateImageUrl,
  templateImageLayout,
  templateLayoutApply,
  busy,
  playbackRate,
  renderButtonLabel,
  renderStageLabel,
  renderStatus,
  renderDisabledReason,
  renderPreflightSummary,
  renderPreflightHasRun,
  showRenderPreflight = true,
  renderPrimaryAction,
  draftIsCurrent,
  finalIsCurrent,
  canEditSelectedCategory = true,
  editPermissionMessage,
  emailTitle,
  onRenderAction,
  onRenderDraftAction,
  onRunRenderPreflightAction,
  onRenderPreflightIssueFixAction,
}: StudioResultPanelProps) {
  void renderButtonLabel;
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [mailStatus, setMailStatus] = useState("");
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [addressBookEnabled, setAddressBookEnabled] = useState(true);
  const [addressBookSaving, setAddressBookSaving] = useState(false);
  const [selectedResultKind, setSelectedResultKind] = useState<StudioResultKind>("draft");
  const [failedResultUrl, setFailedResultUrl] = useState<string | null>(null);

  const persistAddressBook = (entries: AddressBookEntry[]) => {
    const next = sortAddressBookEntries(entries).slice(0, STUDIO_EMAIL_ADDRESS_BOOK_LIMIT);
    setAddressBook(next);
    writeScopedStorage(STUDIO_EMAIL_ADDRESS_BOOK_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = readScopedStorage(STUDIO_EMAIL_ADDRESS_BOOK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          persistAddressBook(
            parsed
              .map((item) => normalizeStoredAddressBookEntry(item))
              .filter((item): item is AddressBookEntry => Boolean(item))
          );
        }
      }
    } catch {
      // ignore
    }

    const loadAddressBook = async () => {
      try {
        const result = await fetchStudioEmailAddressBook();
        if (cancelled) return;
        setAddressBookEnabled(result.enabled);
        persistAddressBook(result.items);
      } catch {
        if (cancelled) return;
      }
    };

    void loadAddressBook();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (uploadedVideoUrl && finalIsCurrent) {
      setSelectedResultKind("final");
    }
  }, [finalIsCurrent, uploadedVideoUrl]);

  const effectiveSelectedResultKind: StudioResultKind =
    selectedResultKind === "final" && !uploadedVideoUrl ? "draft" : selectedResultKind;
  const selectedResultUrl = effectiveSelectedResultKind === "final" ? uploadedVideoUrl : videoUrl;
  const selectedResultLoadFailed = Boolean(selectedResultUrl && failedResultUrl === selectedResultUrl);
  const selectedResultLabel = effectiveSelectedResultKind === "final" ? "최종 영상" : "1차 확인본";
  const selectedResultDownloadHref = selectedResultUrl
    ? effectiveSelectedResultKind === "final"
      ? `/api/assets/download?url=${encodeURIComponent(selectedResultUrl)}&filename=${encodeURIComponent(downloadFileName)}`
      : selectedResultUrl
    : "#";
  const normalizedAddressBook = useMemo(
    () =>
      sortAddressBookEntries(
        addressBook.filter((item, index, items) => items.findIndex((candidate) => candidate.email === item.email) === index)
      ),
    [addressBook]
  );
  const hasSendableVideo = Boolean(uploadedVideoUrl && finalIsCurrent);
  const primaryDisabledReason =
    renderPrimaryAction.disabledReason ||
    (renderPrimaryAction.kind === "render_draft" || renderPrimaryAction.kind === "render_final"
      ? renderDisabledReason
      : null);

  const handlePrimaryRenderAction = () => {
    if (renderPrimaryAction.kind === "run_preflight") {
      onRunRenderPreflightAction();
      return;
    }
    if (renderPrimaryAction.kind === "render_draft") {
      (onRenderDraftAction || onRenderAction)();
      return;
    }
    if (renderPrimaryAction.kind === "render_final") {
      onRenderAction();
      return;
    }
    if (renderPrimaryAction.kind === "complete") {
      setSelectedResultKind("final");
    }
  };

  const handleSaveAddress = async () => {
    const { recipients, invalidRecipients } = parseEmailRecipients(email);
    if (invalidRecipients.length > 0) {
      setMailStatus(`유효하지 않은 메일 주소가 있습니다: ${invalidRecipients.join(", ")}`);
      return;
    }
    if (recipients.length === 0) {
      setMailStatus("저장할 메일 주소를 입력해 주세요.");
      return;
    }
    if (recipients.length > 1) {
      setMailStatus("주소록 저장은 한 번에 한 메일 주소만 가능합니다.");
      return;
    }
    const recipient = recipients[0];
    const promptLabel =
      typeof window !== "undefined"
        ? window.prompt("주소록에 표시할 이름을 입력해 주세요. 비워두면 메일 앞부분을 사용합니다.", resolveStudioEmailLabel(recipient))
        : resolveStudioEmailLabel(recipient);
    if (promptLabel === null) {
      return;
    }
    const entry = {
      email: recipient,
      label: (promptLabel || "").trim() || resolveStudioEmailLabel(recipient),
    };
    setAddressBookSaving(true);
    try {
      const result = await saveStudioEmailAddressBookEntries({
        entries: [entry],
      });
      setAddressBookEnabled(result.enabled);
      persistAddressBook(result.items);
      setMailStatus("주소록에 저장했습니다.");
    } catch (error) {
      const next = mergeAddressBookEntries(normalizedAddressBook, [entry]);
      persistAddressBook(next);
      setMailStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setAddressBookSaving(false);
    }
  };

  const handleSendEmail = async () => {
    const { recipients, invalidRecipients } = parseEmailRecipients(email);
    if (invalidRecipients.length > 0) {
      setMailStatus(`유효하지 않은 메일 주소가 있습니다: ${invalidRecipients.join(", ")}`);
      return;
    }
    if (recipients.length === 0) {
      setMailStatus("받을 메일 주소를 입력해 주세요.");
      return;
    }
    if (!uploadedVideoUrl) {
      setMailStatus("메일 전송은 업로드된 최종 렌더 결과가 있을 때만 가능합니다.");
      return;
    }
    if (!finalIsCurrent) {
      setMailStatus("메일 전송은 최신 최종 영상만 가능합니다. 최종 영상을 다시 제작해 주세요.");
      return;
    }
    setSending(true);
    setMailStatus("");
    try {
      const result = await requestStudioEmailSend({
        to: recipients,
        videoUrl: uploadedVideoUrl,
        fileName: downloadFileName,
        title: emailTitle,
      });
      if (!result.responseOk || !("ok" in result.data) || !result.data.ok) {
        throw new Error("메일 전송에 실패했습니다.");
      }
      const next = mergeAddressBookEntries(normalizedAddressBook, recipients.map((item) => ({ email: item })));
      persistAddressBook(next);
      void saveStudioEmailAddressBookEntries({
        entries: recipients.map((item) => ({ email: item })),
      })
        .then((response) => {
          setAddressBookEnabled(response.enabled);
          persistAddressBook(response.items);
        })
        .catch(() => undefined);
      setMailStatus(
        result.data.deliveryMode === "link_only"
          ? `전송 완료: ${result.data.sentTo} (용량이 커서 다운로드 링크로 발송)`
          : `전송 완료: ${result.data.sentTo}`
      );
    } catch (error) {
      setMailStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card studio-right-column studio-result-shell">
      <div className="studio-result-stage-card">
        <div className="studio-result-stage-badge">{renderStageLabel}</div>
      </div>
      <section className="studio-result-workflow-section">
        <div className="studio-result-section-title">검수</div>
        <div className="studio-result-switcher" role="group" aria-label="렌더 결과 선택">
          {[
            {
              kind: "draft" as const,
              label: "1차 확인본",
              hasResult: Boolean(videoUrl),
              isCurrent: draftIsCurrent,
              disabled: !videoUrl && !hasPreparedSlides,
            },
            {
              kind: "final" as const,
              label: "최종 영상",
              hasResult: Boolean(uploadedVideoUrl),
              isCurrent: finalIsCurrent,
              disabled: !uploadedVideoUrl,
            },
          ].map((item) => {
            const isSelected = effectiveSelectedResultKind === item.kind;
            const statusLabel = item.hasResult ? (item.isCurrent ? "최신" : "이전 결과") : "대기";
            return (
              <button
                key={item.kind}
                type="button"
                className={`studio-result-switch-button${isSelected ? " is-active" : ""}${item.hasResult && !item.isCurrent ? " is-stale" : ""}`}
                onClick={() => setSelectedResultKind(item.kind)}
                aria-pressed={isSelected}
                disabled={item.disabled}
              >
                <span>{item.label}</span>
                <strong>{statusLabel}</strong>
              </button>
            );
          })}
        </div>
        <div className="studio-result-preview-shell">
          <div className="studio-result-preview-frame">
            {selectedResultUrl ? (
              <video
                controls
                src={selectedResultUrl}
                className="studio-result-video"
                onError={() => setFailedResultUrl(selectedResultUrl)}
              />
            ) : effectiveSelectedResultKind === "draft" && hasPreparedSlides ? (
              <StudioRemotionPlayerPreview
                slides={previewPlayerSlides}
                branding={branding}
                templateId={templateId}
                templateData={templateData}
                templateImageEnabled={templateImageEnabled}
                templateImageUrl={templateImageUrl}
                templateImageLayout={templateImageLayout}
                templateLayoutApply={templateLayoutApply}
                frameDurationsSec={previewPlayerFrameDurations}
                playbackRate={playbackRate}
              />
            ) : (
              <div className="studio-result-placeholder">
                {effectiveSelectedResultKind === "final" ? "아직 최종 영상이 없습니다." : "아직 렌더된 영상이 없습니다."}
              </div>
            )}
          </div>
        </div>

        {selectedResultLoadFailed ? (
          <div className="studio-result-review-status">
            {selectedResultLabel}을(를) 불러오지 못했습니다. 영상 파일이 지워졌거나 저장소 주소가 서버 주소와 다를 수 있습니다.
          </div>
        ) : effectiveSelectedResultKind === "final" && uploadedVideoUrl ? (
          <div className={finalIsCurrent ? "studio-result-upload-status" : "studio-result-review-status"}>
            {finalIsCurrent
              ? "최신 최종 영상입니다."
              : "현재 입력과 다른 이전 최종본입니다."}
          </div>
        ) : effectiveSelectedResultKind === "draft" && videoUrl ? (
          <div className="studio-result-review-status">
            {draftIsCurrent
              ? "현재 입력과 일치하는 확인본입니다."
              : "현재 입력과 다른 이전 확인본입니다."}
          </div>
        ) : null}

        {showRenderPreflight ? (
          <StudioRenderPreflightPanel
            summary={renderPreflightSummary}
            hasRun={renderPreflightHasRun}
            hasDraftVideo={Boolean(videoUrl)}
            hasFinalVideo={Boolean(uploadedVideoUrl)}
            draftIsCurrent={draftIsCurrent}
            finalIsCurrent={finalIsCurrent}
            onFixIssueAction={onRenderPreflightIssueFixAction}
          />
        ) : null}
      </section>

      <section className="studio-result-workflow-section">
        <div className="studio-result-section-title">렌더</div>
        <div className="studio-result-actions">
          <div className="studio-result-action-grid">
            <button
              type="button"
              className="btn-primary"
              onClick={handlePrimaryRenderAction}
              disabled={
                busy ||
                !hasPreparedSlides ||
                renderPrimaryAction.disabled ||
                Boolean(primaryDisabledReason) ||
                !canEditSelectedCategory
              }
              title={primaryDisabledReason || undefined}
            >
              {renderPrimaryAction.label}
            </button>
            <a
              href={selectedResultDownloadHref}
              className={`btn-secondary studio-result-download-link${selectedResultUrl ? "" : " is-disabled"}`}
              download={downloadFileName}
              aria-disabled={!selectedResultUrl}
            >
              {selectedResultLabel} 다운로드
            </a>
          </div>
          {!canEditSelectedCategory && editPermissionMessage ? (
            <div className="studio-result-status-stack">
              <div className="studio-result-permission-note">
                {editPermissionMessage}
              </div>
            </div>
          ) : null}
          {primaryDisabledReason || renderStatus ? (
            <div className="studio-result-status-stack">
              {primaryDisabledReason ? (
                <div className="studio-result-disabled-note">
                  {primaryDisabledReason}
                </div>
              ) : null}
              {renderStatus ? (
                <div className="studio-result-progress-note">
                  {renderStatus}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {hasSendableVideo ? (
        <details className="studio-result-completion-actions">
          <summary>완료 후 작업</summary>
          <div className="studio-email-panel">
            <div className="studio-email-header">
              <strong>메일로 보내기</strong>
            </div>
            <div className="studio-email-entry-list">
              {STUDIO_EMAIL_QUICK_RECIPIENTS.map((entry) => (
                <div key={entry.id} className="studio-email-entry">
                  <button type="button" className="studio-email-chip studio-email-chip-select" onClick={() => setEmail((current) => appendEmailRecipient(current, entry.email))}>
                    <span className="studio-email-chip-copy">
                      <strong>{entry.label}</strong>
                      <span>{entry.email}</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <div className="studio-email-form">
              <input
                type="text"
                inputMode="email"
                className="input-field"
                placeholder="받을 메일 주소, 콤마(,)로 여러 개 입력"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={sending}
              />
              <div className="studio-email-actions">
                <button type="button" className="btn-secondary" onClick={() => void handleSaveAddress()} disabled={sending || addressBookSaving}>
                  주소록 저장
                </button>
                <button type="button" className="btn-primary" onClick={() => void handleSendEmail()} disabled={sending}>
                  {sending ? "전송 중..." : "메일로 보내기"}
                </button>
              </div>
            </div>
            {!addressBookEnabled ? <div className="studio-email-help">주소록은 이 브라우저에 저장됩니다.</div> : null}
            {normalizedAddressBook.length > 0 ? (
              <div className="studio-email-address-book">
                {normalizedAddressBook.map((entry) => (
                  <div key={entry.email} className="studio-email-entry">
                    <button type="button" className="studio-email-chip studio-email-chip-select" onClick={() => setEmail((current) => appendEmailRecipient(current, entry.email))}>
                      <span className="studio-email-chip-copy">
                        <strong>{entry.label}</strong>
                        <span>{entry.email}</span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {mailStatus ? <div className="studio-email-status">{mailStatus}</div> : null}
          </div>
        </details>
      ) : null}

    </section>
  );
}
