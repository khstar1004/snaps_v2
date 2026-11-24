"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, Suspense, useMemo, useState } from "react";

type LoginResponse = {
  ok: boolean;
  user?: {
    role?: "admin" | "member";
  };
  error?: string;
};

function LoginPageFrame({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="page-login-shell">
      <section className="card page-login-card">
        <div className="page-login-copy">
          <div className="page-login-kicker">Shorts Studio</div>
          <h1>로그인</h1>
          <p className="page-hero-description">
            사용자별 고객 카테고리와 작업 데이터를 분리해서 관리합니다.
          </p>
        </div>
        {children}
      </section>
    </main>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = useMemo(() => {
    const next = (searchParams.get("next") || "/home").trim();
    return next.startsWith("/") ? next : "/home";
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginId.trim() || !password.trim()) {
      setMessage("아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginId,
          password,
        }),
      });
      const data = (await response.json().catch(() => ({ ok: false, error: "로그인에 실패했습니다." }))) as LoginResponse;
      if (!response.ok || !data.ok) {
        setMessage(data.error || "로그인에 실패했습니다.");
        return;
      }
      const destination = data.user?.role === "admin" && nextPath === "/home" ? "/admin/overview" : nextPath;
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoginPageFrame>
        <form className="page-login-form" onSubmit={handleSubmit}>
          <div className="page-login-field">
            <label htmlFor="login-id">
              아이디
            </label>
            <input
              id="login-id"
              className="input-field"
              autoComplete="username"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="아이디 입력"
            />
          </div>

          <div className="page-login-field">
            <label htmlFor="login-password">
              비밀번호
            </label>
            <input
              id="login-password"
              type="password"
              className="input-field"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호 입력"
            />
          </div>

          {message ? (
            <div className="page-inline-banner is-error">{message}</div>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {process.env.NODE_ENV !== "production" ? (
          <div className="page-inline-banner is-info">
            개발 환경에서는 `npm run auth:bootstrap-admin`으로 관리자 계정을 준비하세요. 명시 env가 없으면 로컬 파생 비밀번호가 콘솔에 안내됩니다.
          </div>
        ) : null}
    </LoginPageFrame>
  );
}

function LoginPageFallback() {
  return (
    <LoginPageFrame>
      <div className="page-section-description">로그인 화면 준비 중...</div>
    </LoginPageFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
