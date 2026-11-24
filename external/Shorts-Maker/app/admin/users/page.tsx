"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { requestApi } from "@/lib/ui/api-client";

const AUTH_SESSION_CHANGED_EVENT = "sm-auth-session-changed";

type AdminUserSummary = {
  id: string;
  loginId: string;
  displayName: string;
  role: "admin" | "member";
  isActive: boolean;
  categories: string[];
  accessMode: "all" | "selected" | "none";
  allAccessLevel: "view" | "edit" | "publish" | "manage";
  grantedCategoryPermissions: Array<{
    category: string;
    accessLevel: "view" | "edit" | "publish" | "manage";
  }>;
  grantedCategories: string[];
  hasCategoryRestrictions: boolean;
  categoryCount: number;
  jobCount: number;
  pendingJobCount: number;
  publishedJobCount: number;
  channelCount: number;
};

type PermissionDraft = {
  mode: "all" | "selected" | "none";
  allAccessLevel: "view" | "edit" | "publish" | "manage";
  categoryLevels: Record<string, "view" | "edit" | "publish" | "manage">;
};

type SessionSnapshot = {
  ok: boolean;
  workspace?: {
    id: string;
    loginId: string;
    displayName: string;
    isActingAs: boolean;
  };
  authUser?: {
    id: string;
  };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [submitting, setSubmitting] = useState(false);
  const [permissionDraftByUserId, setPermissionDraftByUserId] = useState<Record<string, PermissionDraft>>({});
  const [savingPermissionUserId, setSavingPermissionUserId] = useState<string | null>(null);
  const overview = useMemo(() => {
    return users.reduce(
      (acc, user) => {
        acc.userCount += 1;
        acc.categoryCount += user.categoryCount;
        acc.channelCount += user.channelCount;
        acc.jobCount += user.jobCount;
        acc.pendingJobCount += user.pendingJobCount;
        acc.publishedJobCount += user.publishedJobCount;
        return acc;
      },
      {
        userCount: 0,
        categoryCount: 0,
        channelCount: 0,
        jobCount: 0,
        pendingJobCount: 0,
        publishedJobCount: 0,
      }
    );
  }, [users]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, sessionData] = await Promise.all([
        requestApi<{ ok: boolean; users?: AdminUserSummary[] }>("/api/admin/users", { cache: "no-store" }, "사용자 목록을 불러오지 못했습니다."),
        requestApi<SessionSnapshot>("/api/auth/session", { cache: "no-store" }, "세션 정보를 불러오지 못했습니다."),
      ]);
      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setSession(sessionData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setPermissionDraftByUserId((prev) => {
      const next: Record<string, PermissionDraft> = {};
      for (const user of users) {
        const fallback: PermissionDraft = {
          mode: user.accessMode,
          allAccessLevel: user.allAccessLevel,
          categoryLevels: Object.fromEntries(
            (user.grantedCategoryPermissions.length > 0
              ? user.grantedCategoryPermissions
              : user.categories.map((category) => ({ category, accessLevel: "manage" as const }))).map((entry) => [
              entry.category,
              entry.accessLevel,
            ])
          ),
        };
        const current = prev[user.id];
        if (!current) {
          next[user.id] = fallback;
          continue;
        }
        const filteredCategoryLevels = Object.fromEntries(
          Object.entries(current.categoryLevels).filter(([category]) => user.categories.includes(category))
        ) as Record<string, "view" | "edit" | "publish" | "manage">;
        next[user.id] = {
          mode: current.mode,
          allAccessLevel: current.allAccessLevel,
          categoryLevels: Object.keys(filteredCategoryLevels).length > 0 ? filteredCategoryLevels : fallback.categoryLevels,
        };
      }
      return next;
    });
  }, [users]);

  const handleCreateUser = async () => {
    if (!loginId.trim() || !password.trim()) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await requestApi<{ ok: boolean }>(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            loginId,
            displayName,
            password,
            role,
          }),
        },
        "사용자를 생성하지 못했습니다."
      );
      setLoginId("");
      setDisplayName("");
      setPassword("");
      setRole("member");
      setMessage("사용자를 생성했습니다.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleResetWorkspace = async () => {
    setMessage("");
    try {
      await requestApi<{ ok: boolean }>(
        "/api/admin/workspace",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: "" }),
        },
        "관리자 작업공간 복원에 실패했습니다."
      );
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveCategoryPermissions = async (user: AdminUserSummary) => {
    const draft = permissionDraftByUserId[user.id] || {
      mode: user.accessMode,
      allAccessLevel: user.allAccessLevel,
      categoryLevels: Object.fromEntries(
        (user.grantedCategoryPermissions.length > 0
          ? user.grantedCategoryPermissions
          : user.categories.map((category) => ({ category, accessLevel: "manage" as const }))).map((entry) => [
          entry.category,
          entry.accessLevel,
        ])
      ),
    };
    const nextAssignments = Object.entries(draft.categoryLevels)
      .filter(([category]) => user.categories.includes(category))
      .map(([category, accessLevel]) => ({
        category,
        accessLevel,
      }));

    if (draft.mode === "selected" && nextAssignments.length <= 0) {
      setMessage("선택 허용 모드에서는 최소 한 개 이상의 고객(category)을 골라야 합니다.");
      return;
    }

    setSavingPermissionUserId(user.id);
    setMessage("");
    try {
      await requestApi<{ ok: boolean }>(
        `/api/admin/users/${encodeURIComponent(user.id)}/category-permissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accessMode: draft.mode,
            allAccessLevel: draft.allAccessLevel,
            categories: nextAssignments,
          }),
        },
        "카테고리 권한을 저장하지 못했습니다."
      );
      setMessage(
        draft.mode === "none"
          ? `${user.displayName} 사용자를 모든 고객(category) 차단 상태로 저장했습니다.`
          : draft.mode === "all"
            ? `${user.displayName} 사용자를 전체 고객(category) ${draft.allAccessLevel} 권한으로 저장했습니다.`
            : `${user.displayName} 사용자의 고객(category)별 권한을 저장했습니다.`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingPermissionUserId(null);
    }
  };

  return (
    <AppLayout>
      <div className="page-stack">
        <section className="card page-hero-card is-admin">
          <div className="page-hero-head">
            <div className="page-hero-copy">
              <div className="page-hero-eyebrow">Admin</div>
              <h1 className="page-hero-title">사용자 관리</h1>
              <p className="page-hero-description">
                관리자 계정에서 사용자별 고객 카테고리와 작업 현황을 한 번에 확인합니다.
              </p>
            </div>
            <div className="page-hero-actions">
              <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
                새로고침
              </button>
              {session?.workspace?.isActingAs ? (
                <button type="button" className="btn-primary" onClick={() => void handleResetWorkspace()}>
                  관리자 작업공간으로 복귀
                </button>
              ) : null}
            </div>
          </div>

          {session?.workspace ? (
            <div className={`page-inline-banner ${session.workspace.isActingAs ? "is-info" : "is-success"}`}>
              현재 작업공간: <strong>{session.workspace.displayName}</strong> ({session.workspace.loginId})
            </div>
          ) : null}

          <div className="page-hero-stats">
            <span className="studio-metric">사용자 {overview.userCount}</span>
            <span className="studio-metric">고객 {overview.categoryCount}</span>
            <span className="studio-metric">채널 {overview.channelCount}</span>
            <span className="studio-metric">작업 {overview.jobCount}</span>
            <span className="studio-metric">대기 {overview.pendingJobCount}</span>
            <span className="studio-metric">완료 {overview.publishedJobCount}</span>
          </div>

          <div className="page-inline-banner is-info">
            여기서는 전체 사용자 현황을 보고, 각 카드의 작업공간 버튼으로 들어가면 해당 사용자의 제작 화면과 고객 데이터까지 이어서 확인할 수 있습니다.
          </div>
        </section>

        <section className="card page-section-card">
          <h2 className="page-section-title">사용자 추가</h2>
          <div className="page-field-grid">
            <input className="input-field" value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="아이디" />
            <input className="input-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="표시 이름" />
            <input className="input-field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" />
            <select className="input-field" value={role} onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "member")}>
              <option value="member">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <div>
            <button type="button" className="btn-primary" disabled={submitting} onClick={() => void handleCreateUser()}>
              {submitting ? "생성 중..." : "사용자 생성"}
            </button>
          </div>
        </section>

        {message ? <div className={`page-inline-banner ${message.includes("실패") || message.includes("못") || message.includes("오류") ? "is-error" : "is-success"}`}>{message}</div> : null}

        <section className="card page-section-card">
          <h2 className="page-section-title">사용자별 현황</h2>
          {loading ? <div style={{ color: "var(--text-secondary)" }}>불러오는 중...</div> : null}
          {!loading && users.length <= 0 ? <div style={{ color: "var(--text-secondary)" }}>등록된 사용자가 없습니다.</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-4)" }}>
            {users.map((user) => {
              const isCurrentWorkspace = session?.workspace?.id === user.id;
              const permissionDraft = permissionDraftByUserId[user.id] || {
                mode: user.accessMode,
                allAccessLevel: user.allAccessLevel,
                categoryLevels: Object.fromEntries(
                  (user.grantedCategoryPermissions.length > 0
                    ? user.grantedCategoryPermissions
                    : user.categories.map((category) => ({ category, accessLevel: "manage" as const }))).map((entry) => [
                    entry.category,
                    entry.accessLevel,
                  ])
                ),
              };
              const effectiveAllowedCategories =
                permissionDraft.mode === "none"
                  ? []
                  : permissionDraft.mode === "all"
                    ? user.categories
                    : Object.keys(permissionDraft.categoryLevels);
              return (
                <article
                  key={user.id}
                  style={{
                    border: isCurrentWorkspace ? "1px solid #93c5fd" : "1px solid var(--border-subtle)",
                    background: isCurrentWorkspace ? "#f8fbff" : "#fff",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "1rem", fontWeight: 700 }}>{user.displayName}</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        {user.loginId} · {user.role === "admin" ? "관리자" : "일반 사용자"}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: user.isActive ? "var(--success-bg)" : "var(--error-bg)",
                        color: user.isActive ? "var(--success)" : "var(--error)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {user.isActive ? "활성" : "비활성"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="studio-metric">고객 {user.categoryCount}</span>
                    <span className="studio-metric">채널 {user.channelCount}</span>
                    <span className="studio-metric">작업 {user.jobCount}</span>
                    <span className="studio-metric">대기 {user.pendingJobCount}</span>
                    <span className="studio-metric">완료 {user.publishedJobCount}</span>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.6,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {user.categories.length > 0 ? user.categories.join(", ") : "등록된 고객(category) 없음"}
                  </div>

                  {user.role === "member" ? (
                    <section
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--space-3)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "0.875rem" }}>카테고리 접근 권한</strong>
                        <span className="studio-metric">
                          {user.accessMode === "none"
                            ? "전체 차단"
                            : user.accessMode === "all"
                              ? `전체 ${user.allAccessLevel}`
                              : `선택 허용 ${user.grantedCategoryPermissions.length}`}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`permission-mode-${user.id}`}
                            checked={permissionDraft.mode === "all"}
                            disabled={savingPermissionUserId === user.id}
                            onChange={() =>
                              setPermissionDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: {
                                  mode: "all",
                                  allAccessLevel: prev[user.id]?.allAccessLevel || user.allAccessLevel,
                                  categoryLevels: Object.fromEntries(user.categories.map((category) => [category, "manage"])),
                                },
                              }))
                            }
                          />
                          전체 고객 허용
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`permission-mode-${user.id}`}
                            checked={permissionDraft.mode === "selected"}
                            disabled={savingPermissionUserId === user.id || user.categories.length <= 0}
                            onChange={() =>
                              setPermissionDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: {
                                  mode: "selected",
                                  allAccessLevel: prev[user.id]?.allAccessLevel || user.allAccessLevel,
                                  categoryLevels:
                                    Object.keys(prev[user.id]?.categoryLevels || {}).length > 0
                                      ? prev[user.id]!.categoryLevels
                                      : Object.fromEntries(
                                          (user.grantedCategoryPermissions.length > 0
                                            ? user.grantedCategoryPermissions
                                            : user.categories.map((category) => ({ category, accessLevel: "manage" as const }))).map((entry) => [
                                            entry.category,
                                            entry.accessLevel,
                                          ])
                                        ),
                                },
                              }))
                            }
                          />
                          선택 고객만 허용
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`permission-mode-${user.id}`}
                            checked={permissionDraft.mode === "none"}
                            disabled={savingPermissionUserId === user.id}
                            onChange={() =>
                              setPermissionDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: {
                                  mode: "none",
                                  allAccessLevel: prev[user.id]?.allAccessLevel || user.allAccessLevel,
                                  categoryLevels: {},
                                },
                              }))
                            }
                          />
                          모두 차단
                        </label>
                      </div>

                      {permissionDraft.mode === "all" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>전체 고객 기본 권한</span>
                          <select
                            className="input-field"
                            value={permissionDraft.allAccessLevel}
                            disabled={savingPermissionUserId === user.id}
                            onChange={(event) =>
                              setPermissionDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] || permissionDraft),
                                  mode: "all",
                                  allAccessLevel: (event.target.value === "view" || event.target.value === "edit" || event.target.value === "publish"
                                    ? event.target.value
                                    : "manage") as "view" | "edit" | "publish" | "manage",
                                },
                              }))
                            }
                          >
                            <option value="view">보기</option>
                            <option value="edit">편집</option>
                            <option value="publish">발행</option>
                            <option value="manage">관리</option>
                          </select>
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {user.categories.length > 0 ? (
                          user.categories.map((category) => {
                            const checked = effectiveAllowedCategories.includes(category);
                            const currentLevel = permissionDraft.categoryLevels[category] || "manage";
                            return (
                              <div
                                key={`${user.id}-${category}`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  border: checked ? "1px solid #93c5fd" : "1px solid var(--border-subtle)",
                                  background: checked ? "#eff6ff" : "#fff",
                                  fontSize: "0.75rem",
                                  color: checked ? "#1d4ed8" : "var(--text-secondary)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={permissionDraft.mode !== "selected" || savingPermissionUserId === user.id}
                                  onChange={(event) => {
                                    const nextChecked = event.target.checked;
                                    setPermissionDraftByUserId((prev) => {
                                      const current = prev[user.id] || {
                                        mode: "selected" as const,
                                        allAccessLevel: user.allAccessLevel,
                                        categoryLevels: Object.fromEntries(
                                          (user.grantedCategoryPermissions.length > 0
                                            ? user.grantedCategoryPermissions
                                            : user.categories.map((entry) => ({ category: entry, accessLevel: "manage" as const }))).map((entry) => [
                                            entry.category,
                                            entry.accessLevel,
                                          ])
                                        ),
                                      };
                                      const nextCategoryLevels = { ...current.categoryLevels };
                                      if (nextChecked) {
                                        nextCategoryLevels[category] = nextCategoryLevels[category] || "manage";
                                      } else {
                                        delete nextCategoryLevels[category];
                                      }
                                      return {
                                        ...prev,
                                        [user.id]: {
                                          mode: "selected",
                                          allAccessLevel: current.allAccessLevel,
                                          categoryLevels: nextCategoryLevels,
                                        },
                                      };
                                    });
                                  }}
                                />
                                {category}
                                {permissionDraft.mode === "selected" && checked ? (
                                  <select
                                    className="input-field"
                                    style={{ minWidth: 88, padding: "4px 8px", fontSize: "0.75rem" }}
                                    value={currentLevel}
                                    disabled={savingPermissionUserId === user.id}
                                    onChange={(event) =>
                                      setPermissionDraftByUserId((prev) => ({
                                        ...prev,
                                        [user.id]: {
                                          ...(prev[user.id] || permissionDraft),
                                          mode: "selected",
                                          categoryLevels: {
                                            ...(prev[user.id]?.categoryLevels || permissionDraft.categoryLevels),
                                            [category]: (event.target.value === "view" || event.target.value === "edit" || event.target.value === "publish"
                                              ? event.target.value
                                              : "manage") as "view" | "edit" | "publish" | "manage",
                                          },
                                        },
                                      }))
                                    }
                                  >
                                    <option value="view">보기</option>
                                    <option value="edit">편집</option>
                                    <option value="publish">발행</option>
                                    <option value="manage">관리</option>
                                  </select>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            아직 권한을 나눌 고객(category)이 없습니다.
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        현재 허용:{" "}
                        {permissionDraft.mode === "none"
                          ? "접근 차단"
                          : permissionDraft.mode === "all"
                            ? `전체 고객(category) / ${permissionDraft.allAccessLevel}`
                            : effectiveAllowedCategories.length > 0
                              ? effectiveAllowedCategories
                                  .map((category) => `${category}(${permissionDraft.categoryLevels[category] || "manage"})`)
                                  .join(", ")
                              : "선택된 고객 없음"}
                      </div>

                      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={savingPermissionUserId === user.id}
                          onClick={() =>
                            setPermissionDraftByUserId((prev) => ({
                              ...prev,
                              [user.id]: {
                                mode: user.accessMode,
                                allAccessLevel: user.allAccessLevel,
                                categoryLevels: Object.fromEntries(
                                  (user.grantedCategoryPermissions.length > 0
                                    ? user.grantedCategoryPermissions
                                    : user.categories.map((category) => ({ category, accessLevel: "manage" as const }))).map((entry) => [
                                    entry.category,
                                    entry.accessLevel,
                                  ])
                                ),
                              },
                            }))
                          }
                        >
                          초기화
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={
                            savingPermissionUserId === user.id ||
                            (permissionDraft.mode === "selected" && user.categories.length <= 0)
                          }
                          onClick={() => void handleSaveCategoryPermissions(user)}
                        >
                          {savingPermissionUserId === user.id ? "저장 중..." : "권한 저장"}
                        </button>
                      </div>
                    </section>
                  ) : (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                        fontSize: "0.8125rem",
                        color: "#1e3a8a",
                        lineHeight: 1.6,
                      }}
                    >
                      관리자 계정은 항상 전체 고객(category)에 접근합니다.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "auto" }}>
                    <button
                      type="button"
                      className={isCurrentWorkspace ? "btn-primary" : "btn-secondary"}
                      onClick={() => void handleSwitchWorkspace(user.id)}
                    >
                      {isCurrentWorkspace ? "현재 작업공간" : "이 사용자 작업공간 보기"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
