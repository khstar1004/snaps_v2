"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { fetchPublishTrash, restorePublishTrashItem } from "@/lib/api/publish-trash-client";
import type {
  DeletedPublishCategorySummary,
  DeletedPublishJobSummary,
  DeletedVideoAssetSummary,
  PublishTrashResponse,
} from "@/lib/publish/client-types";
import { toCategoryLabel } from "@/lib/publish/categories";
import { toPublishJobStatusLabel } from "@/lib/publish/job-status";

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isErrorMessage(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return false;
  return normalized.includes("실패") || normalized.includes("오류") || normalized.includes("못");
}

export default function TrashPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<DeletedPublishCategorySummary[]>([]);
  const [jobs, setJobs] = useState<DeletedPublishJobSummary[]>([]);
  const [assets, setAssets] = useState<DeletedVideoAssetSummary[]>([]);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPublishTrash();
      const payload = data as PublishTrashResponse;
      setCategories(Array.isArray(payload.categories) ? payload.categories : []);
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(
    () => ({
      categories: categories.length,
      jobs: jobs.length,
      assets: assets.length,
      total: categories.length + jobs.length + assets.length,
    }),
    [assets.length, categories.length, jobs.length]
  );

  const handleRestore = useCallback(
    async (input: {
      key: string;
      label: string;
      resourceType: "category" | "job" | "asset";
      category?: string;
      jobId?: string;
      assetId?: string;
    }) => {
      setRestoringKey(input.key);
      setMessage("");
      try {
        await restorePublishTrashItem(input);
        setMessage(`${input.label} 항목을 복구했습니다.`);
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setRestoringKey(null);
      }
    },
    [refresh]
  );

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ marginBottom: "var(--space-2)" }}>휴지통</h1>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                삭제한 고객(category), 실패/취소 작업, 영상 자산을 복구합니다.
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
              새로고침
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="studio-metric">전체 {summary.total}</span>
            <span className="studio-metric">고객 {summary.categories}</span>
            <span className="studio-metric">작업 {summary.jobs}</span>
            <span className="studio-metric">자산 {summary.assets}</span>
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#1e3a8a",
              fontSize: "0.875rem",
              lineHeight: 1.6,
            }}
          >
            영상 파일 원본과 고객 설정은 즉시 지우지 않고 휴지통으로 이동합니다. 복구하면 기존 연결 정보를 그대로 다시 사용할 수 있습니다.
          </div>
        </section>

        {message ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: isErrorMessage(message) ? "var(--error-bg)" : "var(--success-bg)",
              color: isErrorMessage(message) ? "var(--error)" : "var(--success)",
              fontSize: "0.875rem",
            }}
          >
            {message}
          </div>
        ) : null}

        <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>삭제된 고객(category)</h2>
            <span className="studio-metric">{categories.length}개</span>
          </div>
          {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
          {!loading && categories.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>삭제된 고객(category)이 없습니다.</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
            {categories.map((item) => (
              <article
                key={`category-${item.key}`}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                <strong>{item.label}</strong>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  키: {item.key}
                  <br />
                  삭제 시각: {formatDateTime(item.deletedAt)}
                  <br />
                  연결 작업 {item.relatedJobCount}건 · 연결 자산 {item.relatedAssetCount}건
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    void handleRestore({
                      key: `category:${item.key}`,
                      label: item.label,
                      resourceType: "category",
                      category: item.key,
                    })
                  }
                  disabled={restoringKey === `category:${item.key}`}
                >
                  {restoringKey === `category:${item.key}` ? "복구 중..." : "고객 복구"}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>삭제된 발행 작업</h2>
            <span className="studio-metric">{jobs.length}개</span>
          </div>
          {!loading && jobs.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>삭제된 발행 작업이 없습니다.</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {jobs.map((item) => (
              <article
                key={`job-${item.id}`}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  background: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", minWidth: 0, flex: 1 }}>
                  <strong style={{ wordBreak: "break-word" }}>{item.title}</strong>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                    상태: {toPublishJobStatusLabel(item.status)}
                    <br />
                    고객: {item.publishCategory ? toCategoryLabel(item.publishCategory) : "미분류"}
                    <br />
                    삭제 시각: {formatDateTime(item.deletedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    void handleRestore({
                      key: `job:${item.id}`,
                      label: item.title,
                      resourceType: "job",
                      jobId: item.id,
                    })
                  }
                  disabled={restoringKey === `job:${item.id}`}
                >
                  {restoringKey === `job:${item.id}` ? "복구 중..." : "작업 복구"}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>삭제된 영상 자산</h2>
            <span className="studio-metric">{assets.length}개</span>
          </div>
          {!loading && assets.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>삭제된 영상 자산이 없습니다.</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
            {assets.map((item) => (
              <article
                key={`asset-${item.id}`}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-4)",
                  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 56%)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                <strong style={{ wordBreak: "break-word" }}>{item.title}</strong>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  고객: {item.publishCategory ? toCategoryLabel(item.publishCategory) : "미분류"}
                  <br />
                  삭제 시각: {formatDateTime(item.deletedAt)}
                  <br />
                  파일 형식: {item.mimeType || "video/mp4"}
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    void handleRestore({
                      key: `asset:${item.id}`,
                      label: item.title,
                      resourceType: "asset",
                      assetId: item.id,
                    })
                  }
                  disabled={restoringKey === `asset:${item.id}`}
                >
                  {restoringKey === `asset:${item.id}` ? "복구 중..." : "자산 복구"}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
