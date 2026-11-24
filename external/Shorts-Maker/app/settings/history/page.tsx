"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { fetchCategoryHistory, restoreCategoryHistoryVersion, type CategoryHistoryEntry } from "@/lib/api/category-history-client";
import { fetchCategories, type CategoryOption } from "@/lib/api/publish-settings-client";
import { listStudioTemplateIds, STUDIO_TEMPLATE_LABELS, type StudioTemplateId } from "@/types/studio-template";

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPreview(value: unknown, fallback: string, maxLength = 92): string {
  const text = asString(value).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function toTagCount(value: unknown): number {
  return Array.isArray(value) ? value.filter((item) => asString(item)).length : 0;
}

function isErrorMessage(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return false;
  return normalized.includes("오류") || normalized.includes("실패") || normalized.includes("못");
}

const TEMPLATE_OPTIONS = listStudioTemplateIds().map((id) => ({
  id,
  label: STUDIO_TEMPLATE_LABELS[id],
}));

export default function SettingsHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [templateId, setTemplateId] = useState<StudioTemplateId>("default");
  const [metadataHistory, setMetadataHistory] = useState<CategoryHistoryEntry[]>([]);
  const [brandingHistory, setBrandingHistory] = useState<CategoryHistoryEntry[]>([]);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCategories();
      const nextCategories = Array.isArray(data.categories) ? data.categories : [];
      setCategories(nextCategories);
      setSelectedCategory((prev) => {
        if (prev && nextCategories.some((item) => item.key === prev)) return prev;
        return nextCategories[0]?.key || "";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!selectedCategory) {
      setMetadataHistory([]);
      setBrandingHistory([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchCategoryHistory({
        category: selectedCategory,
        templateId,
      });
      setMetadataHistory(Array.isArray(data.metadataHistory) ? data.metadataHistory : []);
      setBrandingHistory(Array.isArray(data.brandingHistory) ? data.brandingHistory : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, templateId]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const summary = useMemo(
    () => ({
      categories: categories.length,
      metadata: metadataHistory.length,
      branding: brandingHistory.length,
    }),
    [brandingHistory.length, categories.length, metadataHistory.length]
  );

  const selectedProfileLabel = useMemo(() => {
    return categories.find((item) => item.key === selectedCategory)?.label || selectedCategory || "선택한 프로필";
  }, [categories, selectedCategory]);

  const handleRestore = useCallback(
    async (entry: CategoryHistoryEntry) => {
      const restoreKey = `${entry.section}:${entry.id}`;
      setRestoringKey(restoreKey);
      setMessage("");
      try {
        await restoreCategoryHistoryVersion({
          category: entry.category,
          section: entry.section,
          versionId: entry.id,
        });
        const profileLabel = categories.find((item) => item.key === entry.category)?.label || entry.category;
        setMessage(`${profileLabel} ${entry.section === "metadata" ? "메타데이터" : "브랜딩"} 버전을 복구했습니다.`);
        await loadHistory();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setRestoringKey(null);
      }
    },
    [categories, loadHistory]
  );

  return (
    <AppLayout>
      <div className="page-stack">
        <section className="card page-hero-card">
          <div className="page-hero-head">
            <div className="page-hero-copy">
              <div className="page-hero-eyebrow">Settings</div>
              <h1 className="page-hero-title">저장소·복구</h1>
              <p className="page-hero-description">
                콘텐츠 프로필별 메타데이터와 브랜딩 스냅샷을 보고 원하는 시점으로 복구합니다.
              </p>
            </div>
            <div className="page-hero-actions">
              <Link href="/settings?tab=contentProfile" className="btn-secondary">
                콘텐츠 프로필 관리
              </Link>
            </div>
          </div>

          <div className="page-hero-stats">
            <span className="studio-metric">프로필 {summary.categories}</span>
            <span className="studio-metric">메타데이터 버전 {summary.metadata}</span>
            <span className="studio-metric">브랜딩 버전 {summary.branding}</span>
          </div>

          <div className="page-field-grid">
            <label className="page-field-stack">
              콘텐츠 프로필
              <select className="input-field" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                {categories.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="page-field-stack">
              프롬프트 템플릿
              <select className="input-field" value={templateId} onChange={(event) => setTemplateId(event.target.value as StudioTemplateId)}>
                {TEMPLATE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="page-inline-banner is-info">
            복구를 누르면 {selectedProfileLabel}의 현재 값 위에 선택한 버전을 다시 저장합니다. 복구 자체도 새 버전으로 한 번 더 기록됩니다.
          </div>
        </section>

        {message ? <div className={`page-inline-banner ${isErrorMessage(message) ? "is-error" : "is-success"}`}>{message}</div> : null}

        <section className="card page-section-card">
          <div className="page-section-head">
            <h2 className="page-section-title">메타데이터 버전</h2>
            <span className="studio-metric">{metadataHistory.length}개</span>
          </div>
          {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
          {!loading && metadataHistory.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>저장된 메타데이터 버전이 없습니다.</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
            {metadataHistory.map((entry) => {
              const restoreKey = `${entry.section}:${entry.id}`;
              return (
                <article
                  key={entry.id}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "#fff",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <strong>{formatDateTime(entry.createdAt)}</strong>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                    저장자: {entry.createdBy || "system"}
                    <br />
                    설명: {toPreview(entry.payload.description, "설명 없음")}
                    <br />
                    태그: {toTagCount(entry.payload.tags)}개
                    <br />
                    메모: {toPreview(entry.payload.templateNotes, "메모 없음")}
                  </div>
                  <button type="button" className="btn-primary" onClick={() => void handleRestore(entry)} disabled={restoringKey === restoreKey}>
                    {restoringKey === restoreKey ? "복구 중..." : "메타데이터 복구"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card page-section-card">
          <div className="page-section-head">
            <h2 className="page-section-title">브랜딩 버전</h2>
            <span className="studio-metric">{brandingHistory.length}개</span>
          </div>
          {!loading && brandingHistory.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>저장된 브랜딩 버전이 없습니다.</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
            {brandingHistory.map((entry) => {
              const restoreKey = `${entry.section}:${entry.id}`;
              return (
                <article
                  key={entry.id}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 56%)",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                  }}
                >
                  <strong>{formatDateTime(entry.createdAt)}</strong>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                    저장자: {entry.createdBy || "system"}
                    <br />
                    헤더: {toPreview(entry.payload.headerTitle, "헤더 없음")}
                    <br />
                    강조: {toPreview(entry.payload.headerAccentText, "강조 텍스트 없음")}
                    <br />
                    폰트: {toPreview(entry.payload.fontFamily, "폰트 미설정")}
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 999, background: asString(entry.payload.headerColor) || "#93c5fd", border: "1px solid var(--border-subtle)" }} />
                    <div style={{ width: 18, height: 18, borderRadius: 999, background: asString(entry.payload.footerColor) || "#60a5fa", border: "1px solid var(--border-subtle)" }} />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>헤더/푸터 색상</span>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => void handleRestore(entry)} disabled={restoringKey === restoreKey}>
                    {restoringKey === restoreKey ? "복구 중..." : "브랜딩 복구"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
