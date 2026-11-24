export type AuthRole = "admin" | "member" | "system";

export type AuthUser = {
  id: string;
  loginId: string;
  email: string;
  displayName: string;
  role: AuthRole;
  isActive: boolean;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionUser = {
  id: string;
  loginId: string;
  email: string;
  displayName: string;
  role: Exclude<AuthRole, "system">;
};

export type WorkspaceSessionUser = SessionUser & {
  authUserId: string;
  authLoginId: string;
  authDisplayName: string;
  workspaceUserId: string;
  workspaceLoginId: string;
  workspaceDisplayName: string;
  isActingAs: boolean;
};
