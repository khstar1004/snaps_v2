export class RequestBodyParseError extends Error {
  readonly status = 400;
  readonly errorCode = "REQUEST_BODY_INVALID";

  constructor(message = "JSON 본문 형식이 올바르지 않습니다.") {
    super(message);
    this.name = "RequestBodyParseError";
  }
}

export function isRequestBodyParseError(error: unknown): error is RequestBodyParseError {
  return error instanceof RequestBodyParseError;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestBodyParseError();
  }
}

export async function readJsonObjectBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}
