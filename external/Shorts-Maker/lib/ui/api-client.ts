import { toUiErrorMessage } from "@/lib/ui/publish-errors";

type ApiResponseBase = {
  ok: boolean;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

export class ApiClientError extends Error {
  errorCode?: string;
  retryable?: boolean;
  rawMessage: string;

  constructor(message: string, options: { errorCode?: string; retryable?: boolean; rawMessage: string }) {
    super(message);
    this.name = "ApiClientError";
    this.errorCode = options.errorCode;
    this.retryable = options.retryable;
    this.rawMessage = options.rawMessage;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

async function readApiJsonResponse<T extends ApiResponseBase>(response: Response): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const isHtml = raw.trim().startsWith("<");
    const message = isHtml
      ? `서버가 JSON 대신 HTML을 반환했습니다. 라우트 또는 개발 서버 상태를 확인해 주세요. (status ${response.status})`
      : `응답이 올바른 JSON 형식이 아닙니다. (status ${response.status})`;
    throw new ApiClientError(message, {
      errorCode: "API_RESPONSE_INVALID_JSON",
      retryable: response.status >= 500,
      rawMessage: message,
    });
  }
}

export async function requestApi<T extends ApiResponseBase>(input: RequestInfo | URL, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(input, init);
  const data = await readApiJsonResponse<T>(response);
  if (!response.ok || !data.ok) {
    const rawMessage = data.error || fallback;
    if (typeof window !== "undefined" && (response.status === 401 || data.errorCode === "AUTH_REQUIRED")) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.assign(`/login?next=${encodeURIComponent(currentPath)}`);
    }
    throw new ApiClientError(toUiErrorMessage(data.errorCode, rawMessage), {
      errorCode: data.errorCode,
      retryable: data.retryable,
      rawMessage,
    });
  }
  return data;
}
