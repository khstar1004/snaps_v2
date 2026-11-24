import { toApiErrorResponse } from "@/lib/publish/api-error";

const INVALID_INPUT_KEYWORDS = ["must", "required", "valid", "empty"];

export function isStudioInvalidInput(message: string, extraKeywords?: string[]): boolean {
  const keywords = extraKeywords ? [...INVALID_INPUT_KEYWORDS, ...extraKeywords] : INVALID_INPUT_KEYWORDS;
  return keywords.some((keyword) => message.includes(keyword));
}

export function toStudioFailureResponse(message: string, invalidInputCode: string, genericCode: string, extraKeywords?: string[]) {
  const invalid = isStudioInvalidInput(message, extraKeywords);
  return toApiErrorResponse(message, {
    status: 400,
    errorCode: invalid ? invalidInputCode : genericCode,
    retryable: !invalid,
  });
}
