import { SHARED_LIBRARY_USER_ID } from "@/lib/auth/bootstrap";

export const SHARED_STUDIO_LIBRARY_SCOPE = "_shared_library";

export function getSharedStudioLibraryUserId(): string {
  return SHARED_LIBRARY_USER_ID;
}

export function getSharedStudioLibraryScope(): string {
  return SHARED_STUDIO_LIBRARY_SCOPE;
}
