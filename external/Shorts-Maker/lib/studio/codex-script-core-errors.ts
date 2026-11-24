export type CodexPipelineErrorCode =
  | "CODEX_AUTH_REQUIRED"
  | "CODEX_LOCAL_CLI_FAILED"
  | "CODEX_OAUTH_FAILED"
  | "TOPIC_TO_SCRIPT_INPUT_INVALID"
  | "TOPIC_TO_SCRIPT_VALIDATION_FAILED"
  | "SCRIPT_TO_JSON_INPUT_INVALID"
  | "SCRIPT_TO_JSON_VALIDATION_FAILED";

export class CodexPipelineError extends Error {
  code: CodexPipelineErrorCode;
  retryable: boolean;
  status: number;

  constructor(
    message: string,
    options: {
      code: CodexPipelineErrorCode;
      retryable: boolean;
      status: number;
    }
  ) {
    super(message);
    this.name = "CodexPipelineError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isCodexPipelineError(error: unknown): error is CodexPipelineError {
  return error instanceof CodexPipelineError;
}
