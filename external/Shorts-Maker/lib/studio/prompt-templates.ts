import type { PublishCategory } from "@/lib/publish/types";
import { normalizeStudioTemplateId, type StudioTemplateId } from "@/types/studio-template";

export type StudioPromptTemplates = {
  topicToScriptPrompt: string;
  scriptToJsonPrompt: string;
};

export const DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE = [
  "한국어 대본만 출력.",
  "반말.",
  "6문장.",
  "첫 문장은 훅.",
  "마지막 문장은 상담 문의 CTA.",
  "카테고리: {{publishCategory}}",
  "주제: {{topic}}",
].join("\n");

export const DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE = [
  "한국어 대본을 JSON 객체 1개로만 구조화해.",
  "창작, 요약, 문장 수정, 단어 추가/삭제 금지.",
  "",
  "[입력 대본]",
  "{{script}}",
  "",
  "[반환 스키마]",
  '{"title":"첫 줄 그대로","slides":[{"lineTokenRanges":[[0,2],[3,5]]}]}',
  "",
  "[규칙]",
  "- title은 첫 번째 비어 있지 않은 물리적 줄 그대로, slides에는 나머지 본문만 넣는다.",
  "- slides 각 항목은 제공된 본문 토큰의 lineTokenRanges만 가진다.",
  "- imageRequest, imageBeats, imageUrl 같은 이미지 관련 필드는 절대 넣지 않는다.",
  "- 모든 토큰을 0번부터 끝까지 누락·중복 없이 정확히 한 번씩 순서대로 사용한다.",
  "- 각 토큰 범위로 복원되는 line은 뒤에 제공되는 최종 줄 폭 예산을 만족하고, 각 slide는 2~4줄이다.",
  '- "달 월(月)"처럼 한글 뜻과 한자 음(漢)이 이어지는 한자 풀이 쌍은 한 line에 둔다.',
  "- 화면에 표시되는 한글·한자·영문·괄호·공백을 모두 줄 폭에 포함한다.",
  "- 한자 풀이 목록과 바로 다음 설명 문단이 합쳐 4줄 이하이면 같은 slide에 둔다.",
  "- 목록과 설명이 합쳐 4줄을 넘으면 글자를 줄이거나 생략하지 말고 다음 slide로 나눈다.",
  "- 완결된 인용문 전체가 최종 줄 폭 예산 안에 들면 반드시 한 line으로 유지한다.",
  "- 줄 폭 예산을 넘는 인용문만 의미 단위에 맞춰 여러 line으로 나눌 수 있다.",
  '- "챙길 수 있어", "감면받을 수 있어", "할 수 없어", "그런 것 같아"처럼 앞 동사와 의존 표현을 합쳐 최종 줄 폭 예산 안에 드는 서술어 묶음은 반드시 한 line으로 유지한다.',
  '- "수 있어", "수 없어", "것 같아" 같은 의존 표현만 한 줄에 홀로 남기지 말고 앞줄을 일찍 끊어 핵심 동사와 같은 줄로 옮긴다.',
  "- 페이지 끝에 연결어, 주어만 있는 구절, 인용 도입부 같은 미완성 의미 단위를 남기지 않는다.",
  "- 미완성 의미 단위는 다음 서술어 또는 인용문과 같은 페이지로 넘긴다.",
  "- JSON 외 설명문, 주석, 마크다운, 코드블록 금지.",
].join("\n");

const TEMPLATE_TOPIC_TO_SCRIPT_PRESET_SUFFIX: Record<StudioTemplateId, string> = {
  default: "",
  black: [
    "[템플릿 프리셋: black]",
    "- 선호 분위기: 더 직설적이고 긴장감 있는 숏폼 톤.",
    "- 훅은 첫 문장에서 바로 갈등/리스크를 던진다.",
    "- 문장은 더 짧게 끊어 리듬감을 만든다.",
    "- CTA는 마지막 한 문장에서 행동 1개만 강하게 지시한다. (예: DM 보내, 오픈카톡 들어와)",
  ].join("\n"),
  "fun-caption": [
    "[템플릿 프리셋: fun-caption]",
    "- 분위기: 더 가볍고 밈 친화적인 숏폼 톤.",
    "- 훅은 짧고 바로 이해되게 시작한다.",
    "- 문장은 리액션 자막처럼 짧게 끊고 리듬을 살린다.",
    "- 마지막 문장은 저장/공유/댓글 유도처럼 가볍게 마무리한다.",
  ].join("\n"),
};

const TEMPLATE_SCRIPT_TO_JSON_PRESET_SUFFIX: Record<StudioTemplateId, string> = {
  default: "",
  black: [
    "[템플릿 프리셋: black]",
    "- line 분할은 더 짧고 강한 리듬을 우선한다. (권장 8~12자)",
    "- 첫 slide는 훅 전달이 가장 빠르게 보이도록 앞 문장을 우선 배치한다.",
    "- CTA 문장은 마지막 slide의 끝 1~2줄에 응축해 배치한다.",
  ].join("\n"),
  "fun-caption": [
    "[템플릿 프리셋: fun-caption]",
    "- line 분할은 더 짧고 리액션 자막처럼 끊는다. (권장 6~10자)",
    "- 첫 slide는 상황 이해가 바로 되게 훅만 먼저 보여준다.",
    "- punch line이나 반전 문장은 마지막 slide에 짧게 응축한다.",
  ].join("\n"),
};

export const STUDIO_PROMPT_TEMPLATE_TOKENS: Record<keyof StudioPromptTemplates, string[]> = {
  topicToScriptPrompt: ["{{publishCategory}}", "{{topic}}"],
  scriptToJsonPrompt: ["{{publishCategory}}", "{{script}}"],
};

const REQUIRED_STUDIO_PROMPT_TEMPLATE_TOKENS: Record<keyof StudioPromptTemplates, string[]> = {
  topicToScriptPrompt: ["{{topic}}"],
  scriptToJsonPrompt: ["{{script}}"],
};

function normalizeTemplate(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function appendTemplatePreset(baseTemplate: string, suffix: string): string {
  const normalizedBase = normalizeTemplate(baseTemplate);
  const normalizedSuffix = normalizeTemplate(suffix || "");
  if (!normalizedSuffix) return normalizedBase;
  return `${normalizedBase}\n\n${normalizedSuffix}`;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = normalizeTemplate(template);
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

export function getDefaultStudioPromptTemplates(templateId?: StudioTemplateId): StudioPromptTemplates {
  const normalizedTemplateId = normalizeStudioTemplateId(templateId);
  return {
    topicToScriptPrompt: appendTemplatePreset(
      DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
      TEMPLATE_TOPIC_TO_SCRIPT_PRESET_SUFFIX[normalizedTemplateId]
    ),
    scriptToJsonPrompt: appendTemplatePreset(
      DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
      TEMPLATE_SCRIPT_TO_JSON_PRESET_SUFFIX[normalizedTemplateId]
    ),
  };
}

export function sanitizeStoredStudioPromptTemplates(input: unknown): Partial<StudioPromptTemplates> {
  if (!input || typeof input !== "object") return {};
  const row = input as Record<string, unknown>;
  const result: Partial<StudioPromptTemplates> = {};
  if (typeof row.topicToScriptPrompt === "string" && row.topicToScriptPrompt.trim()) {
    result.topicToScriptPrompt = normalizeTemplate(row.topicToScriptPrompt);
  }
  if (typeof row.scriptToJsonPrompt === "string" && row.scriptToJsonPrompt.trim()) {
    result.scriptToJsonPrompt = normalizeTemplate(row.scriptToJsonPrompt);
  }
  return result;
}

export function resolveStudioPromptTemplate(
  key: keyof StudioPromptTemplates,
  value: unknown,
  options?: { templateId?: StudioTemplateId }
): string {
  const defaults = getDefaultStudioPromptTemplates(options?.templateId);
  if (typeof value !== "string" || !value.trim()) return defaults[key];
  const normalized = normalizeTemplate(value);
  return validateStudioPromptTemplate(key, normalized) ? defaults[key] : normalized;
}

export function isDefaultStudioPromptTemplate(
  key: keyof StudioPromptTemplates,
  value: string,
  templateId?: StudioTemplateId
): boolean {
  return normalizeTemplate(value) === getDefaultStudioPromptTemplates(templateId)[key];
}

export function validateStudioPromptTemplate(
  key: keyof StudioPromptTemplates,
  value: string
): string | null {
  const normalized = normalizeTemplate(value);
  if (!normalized) {
    return "프롬프트는 비워 둘 수 없습니다.";
  }
  const missing = REQUIRED_STUDIO_PROMPT_TEMPLATE_TOKENS[key].filter((token) => !normalized.includes(token));
  if (missing.length <= 0) return null;
  return `필수 토큰이 없습니다: ${missing.join(", ")}`;
}

export function renderTopicToScriptPromptTemplate(input: {
  topic: string;
  publishCategory?: PublishCategory;
  template?: string;
  templateId?: StudioTemplateId;
}): string {
  return renderTemplate(resolveStudioPromptTemplate("topicToScriptPrompt", input.template, { templateId: input.templateId }), {
    publishCategory: input.publishCategory?.trim() || "default",
    topic: input.topic.trim(),
  });
}

export function renderScriptToJsonPromptTemplate(input: {
  script: string;
  publishCategory?: PublishCategory;
  template?: string;
  templateId?: StudioTemplateId;
}): string {
  return renderTemplate(resolveStudioPromptTemplate("scriptToJsonPrompt", input.template, { templateId: input.templateId }), {
    publishCategory: input.publishCategory?.trim() || "default",
    script: input.script.trim(),
  });
}
