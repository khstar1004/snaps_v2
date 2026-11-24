import { NextResponse } from "next/server";

export function toApiErrorResponse(
  error: string,
  options?: {
    status?: number;
    errorCode?: string;
    retryable?: boolean;
  }
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      errorCode: options?.errorCode || "REQUEST_FAILED",
      retryable: typeof options?.retryable === "boolean" ? options.retryable : false,
    },
    { status: options?.status || 400 }
  );
}
