export function isLocalAuthBypassEnabled(): boolean {
  const bypassFlag = (process.env.AUTH_LOCAL_BYPASS || "").trim().toLowerCase() === "true";
  if (!bypassFlag) return false;
  return process.env.NODE_ENV !== "production";
}

export function getLocalAuthBypassSessionUser() {
  return {
    id: (process.env.LOCAL_AUTH_BYPASS_USER_ID || "local-dev-user").trim() || "local-dev-user",
    loginId: (process.env.LOCAL_AUTH_BYPASS_LOGIN_ID || "local-dev").trim() || "local-dev",
    email: (process.env.LOCAL_AUTH_BYPASS_USER_EMAIL || "local@localhost").trim() || "local@localhost",
    displayName: (process.env.LOCAL_AUTH_BYPASS_DISPLAY_NAME || "로컬 개발").trim() || "로컬 개발",
    role: ((process.env.LOCAL_AUTH_BYPASS_ROLE || "admin").trim().toLowerCase() === "admin" ? "admin" : "member") as "admin" | "member",
  };
}
