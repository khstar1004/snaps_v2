import { isApiClientError } from "@/lib/ui/api-client";

export function toTelemetryErrorDetail(error: unknown): {
  detail: string;
  errorCode?: string;
  retryable?: boolean;
} {
  if (isApiClientError(error)) {
    return {
      detail: error.errorCode ? `${error.errorCode}: ${error.rawMessage}` : error.rawMessage,
      errorCode: error.errorCode,
      retryable: error.retryable,
    };
  }

  return {
    detail: error instanceof Error ? error.message : String(error),
  };
}
