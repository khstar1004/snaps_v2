"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { requestApi } from "@/lib/ui/api-client";

const AUTH_SESSION_CHANGED_EVENT = "sm-auth-session-changed";

type AdminOverviewMetrics = {
  totalUsers: number;
  activeUsers: number;
  memberUsers: number;
  adminUsers: number;
  totalCategories: number;
  totalChannels: number;
  totalJobs: number;
  pendingJobs: number;
  publishedJobs: number;
  totalAssets: number;
};

type AdminUserSummary = {
  id: string;
  loginId: string;
  displayName: string;
  role: "admin" | "member";
  isActive: boolean;
  categories: string[];
  categoryCount: number;
  jobCount: number;
  pendingJobCount: number;
  publishedJobCount: number;
  channelCount: number;
};

type AdminCategorySummary = {
  key: string;
  label: string;
  userCount: number;
  jobCount: number;
  pendingJobCount: number;
  publishedJobCount: number;
  assetCount: number;
};

type AuditLogEntry = {
  id: string;
  actorLoginId: string;
  actorDisplayName: string;
  workspaceLoginId: string;
  workspaceDisplayName: string;
  isActingAs: boolean;
  action: string;
  resourceType: string;
  resourceLabel: string;
  detail: string;
  route: string;
  createdAt: number;
};

type AdminOverviewSnapshot = {
  metrics: AdminOverviewMetrics;
  topUsers: AdminUserSummary[];
  topCategories: AdminCategorySummary[];
  recentAuditLogs: AuditLogEntry[];
};

function formatDateTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toActionLabel(action: string): string {
  const normalized = action.trim();
  if (normalized === "admin.workspace_switched") return "작업공간 전환";
  if (normalized === "admin.workspace_reset") return "관리자 복귀";
  if (normalized === "admin.user_created") return "사용자 생성";
  if (normalized === "category.added") return "고객 추가";
  if (normalized === "category.renamed") return "고객 이름 변경";
  if (normalized === "category.deleted") return "고객 휴지통 이동";
  if (normalized === "category.restored") return "고객 복구";
  if (normalized === "category.metadata_updated") return "고객 메모 수정";
  if (normalized === "category.metadata_reset") return "고객 메모 초기화";
  if (normalized === "category.metadata_restored") return "고객 메모 복구";
  if (normalized === "category.branding_updated") return "브랜딩 수정";
  if (normalized === "category.branding_reset") return "브랜딩 초기화";
  if (normalized === "category.branding_restored") return "브랜딩 복구";
  if (normalized === "asset.deleted") return "자산 휴지통 이동";
  if (normalized === "asset.restored") return "자산 복구";
  if (normalized === "publish.created") return "즉시 발행 생성";
  if (normalized === "publish.scheduled") return "예약 발행 생성";
  if (normalized === "publish.run_now") return "즉시 실행";
  if (normalized === "publish.canceled") return "발행 취소";
  if (normalized === "publish.deleted") return "실패 작업 휴지통 이동";
  if (normalized === "publish.restored") return "실패 작업 복구";
  return normalized || "기록";
}

function toMetricCards(metrics: AdminOverviewMetrics) {
  return [
    { label: "전체 사용자", value: metrics.totalUsers, tone: "#2563eb", background: "#eff6ff" },
    { label: "활성 사용자", value: metrics.activeUsers, tone: "#0f766e", background: "#ecfeff" },
    { label: "고객 카테고리", value: metrics.totalCategories, tone: "#1d4ed8", background: "#f8fbff" },
    { label: "연결 채널", value: metrics.totalChannels, tone: "#0369a1", background: "#f0f9ff" },
    { label: "전체 작업", value: metrics.totalJobs, tone: "#1f2937", background: "#f8fafc" },
    { label: "예약 대기", value: metrics.pendingJobs, tone: "#b45309", background: "#fffbeb" },
    { label: "발행 완료", value: metrics.publishedJobs, tone: "#15803d", background: "#f0fdf4" },
    { label: "업로드 자산", value: metrics.totalAssets, tone: "#7c3aed", background: "#f5f3ff" },
  ];
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [overview, setOverview] = useState<AdminOverviewSnapshot | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const data = await requestApi<{ ok: boolean; overview?: AdminOverviewSnapshot }>(
        "/api/admin/overview",
        { cache: "no-store" },
        "관리자 대시보드를 불러오지 못했습니다."
      );
      setOverview(data.overview || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const metricCards = useMemo(() => toMetricCards(overview?.metrics || {
    totalUsers: 0,
    activeUsers: 0,
    memberUsers: 0,
    adminUsers: 0,
    totalCategories: 0,
    totalChannels: 0,
    totalJobs: 0,
    pendingJobs: 0,
    publishedJobs: 0,
    totalAssets: 0,
  }), [overview?.metrics]);

  const handleSwitchWorkspace = async (userId: string) => {
    setMessage("");
    try {
      await requestApi<{ ok: boolean }>(
        "/api/admin/workspace",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        },
        "작업공간 전환에 실패했습니다."
      );
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      router.push("/home");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AppLayout>
      <div className="page-stack">
        <section className="card page-hero-card is-admin">
          <div className="page-hero-head">
            <div className="page-hero-copy">
              <div className="page-hero-eyebrow">Admin</div>
              <h1 className="page-hero-title">관리자 대시보드</h1>
              <p className="page-hero-description">
                전체 사용자, 고객(category), 작업, 자산, 최근 운영 기록을 한 화면에서 봅니다.
              </p>
            </div>
            <div className="page-hero-actions">
              <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
                새로고침
              </button>
              <button type="button" className="btn-primary" onClick={() => router.push("/admin/users")}>
                사용자 관리
              </button>
            </div>
          </div>

          <div className="page-grid-3">
            {metricCards.map((card) => (
              <article
                key={card.label}
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  background: card.background,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{card.label}</div>
                <strong style={{ fontSize: "1.6rem", color: card.tone }}>{card.value.toLocaleString("ko-KR")}</strong>
              </article>
            ))}
          </div>
        </section>

        {message ? <div className="page-inline-banner is-error">{message}</div> : null}

        <section className="page-grid-sidebar">
          <div className="card page-section-card">
            <div className="page-section-head">
              <div className="page-section-copy">
                <h2 className="page-section-title">사용자별 운영 현황</h2>
                <p className="page-section-description">
                  작업량이 많은 순서로 우선 노출합니다.
                </p>
              </div>
            </div>

            {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
            {!loading && (!overview || overview.topUsers.length <= 0) ? (
              <div style={{ color: "var(--text-secondary)" }}>표시할 사용자 데이터가 없습니다.</div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-3)" }}>
              {overview?.topUsers.map((user) => (
                <article
                  key={user.id}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "#fff",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: 700 }}>{user.displayName}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {user.loginId} · {user.role === "admin" ? "관리자" : "일반 사용자"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="studio-metric">고객 {user.categoryCount}</span>
                    <span className="studio-metric">채널 {user.channelCount}</span>
                    <span className="studio-metric">작업 {user.jobCount}</span>
                    <span className="studio-metric">대기 {user.pendingJobCount}</span>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.6,
                    }}
                  >
                    {user.categories.length > 0 ? user.categories.join(", ") : "등록된 고객(category) 없음"}
                  </div>

                  <button type="button" className="btn-primary" onClick={() => void handleSwitchWorkspace(user.id)}>
                    이 사용자 작업공간 열기
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="card page-section-card">
            <div className="page-section-copy">
              <h2 className="page-section-title">고객 운영량 상위</h2>
              <p className="page-section-description">
                고객별 작업/자산 집중도를 빠르게 봅니다.
              </p>
            </div>

            {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
            {!loading && (!overview || overview.topCategories.length <= 0) ? (
              <div style={{ color: "var(--text-secondary)" }}>표시할 고객 데이터가 없습니다.</div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {overview?.topCategories.map((category) => (
                <article
                  key={category.key}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    background: "#fff",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center" }}>
                    <strong>{category.label}</strong>
                    <span className="studio-metric">사용자 {category.userCount}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="studio-metric">작업 {category.jobCount}</span>
                    <span className="studio-metric">대기 {category.pendingJobCount}</span>
                    <span className="studio-metric">완료 {category.publishedJobCount}</span>
                    <span className="studio-metric">자산 {category.assetCount}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="card page-section-card">
          <div className="page-section-copy">
            <h2 className="page-section-title">최근 감사 로그</h2>
            <p className="page-section-description">
              관리자 작업, 고객 변경, 발행 제어, 자산 삭제를 최근 순서로 표시합니다.
            </p>
          </div>

          {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
          {!loading && (!overview || overview.recentAuditLogs.length <= 0) ? (
            <div style={{ color: "var(--text-secondary)" }}>아직 감사 로그가 없습니다. 이제부터 주요 작업이 여기에 쌓입니다.</div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {overview?.recentAuditLogs.map((log) => (
              <article
                key={log.id}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  padding: "12px 14px",
                  display: "grid",
                  gridTemplateColumns: "180px minmax(0, 1fr)",
                  gap: "var(--space-3)",
                }}
              >
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <div>{formatDateTime(log.createdAt)}</div>
                  <div>{toActionLabel(log.action)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                    {log.resourceLabel || log.resourceType}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    실행자: {log.actorDisplayName} ({log.actorLoginId})
                    {log.isActingAs
                      ? ` · 작업공간: ${log.workspaceDisplayName} (${log.workspaceLoginId})`
                      : ""}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {log.detail || "상세 내용 없음"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{log.route || "-"}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
