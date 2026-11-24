import { renderTopicToScriptPromptTemplate } from "@/lib/studio/prompt-templates";
import type { PublishCategory } from "@/types/studio-json";

export type DialogueMode = "normal" | "dialogue";

export type ScriptQualityIssue = {
  code: string;
  message: string;
};

type CategoryToneProfile = {
  key: string;
  match: string[];
  prompt: string;
};

export const TOPIC_SCRIPT_MIN_LINES = 6;
export const TOPIC_SCRIPT_MAX_LINES = 10;
export const TOPIC_SCRIPT_MIN_BODY_LINES = 4;
export const TOPIC_SCRIPT_MAX_BODY_LINES = 8;
export const TOPIC_SCRIPT_MIN_TOTAL_CHARS = 300;
export const TOPIC_SCRIPT_MAX_TOTAL_CHARS = 400;
export const TOPIC_HOOK_MIN_CHARS = 8;
export const TOPIC_HOOK_MAX_CHARS = 36;
export const TOPIC_BODY_MIN_CHARS = 10;
export const TOPIC_BODY_MAX_CHARS = 72;
export const TOPIC_CTA_MIN_CHARS = 14;
export const TOPIC_CTA_MAX_CHARS = 84;

const HOOK_SIGNAL_TOKENS = [
  "왜",
  "지금",
  "결국",
  "핵심은",
  "문제는",
  "포인트는",
  "의외로",
  "사실",
  "방금",
  "이게",
  "진짜",
  "알고 보면",
  "한마디로",
  "반전",
  "충격",
  "논란",
  "설마",
  "이 정도로",
  "변호사까지",
] as const;
const CTA_ACTION_TOKENS = [
  "구독",
  "댓글",
  "좋아요",
  "알림",
  "팔로우",
  "저장",
  "공유",
  "follow",
  "subscribe",
  "comment",
  "상담",
  "문의",
  "dm",
  "디엠",
  "오픈카톡",
  "카톡",
  "연락",
] as const;
const CTA_RESPONSE_TOKENS = [
  "생각",
  "의견",
  "입장",
  "어떻게 보세요",
  "어떻게 생각",
  "어떤가요",
  "한 줄",
  "남겨",
  "알려",
  "여러분",
  "토론",
  "궁금",
  "상담",
] as const;
const CTA_IMPERATIVE_TOKENS = ["하세요", "해주세요", "남겨", "눌러", "보세요", "설정", "참여", "적어", "알려", "문의", "상담", "연락"] as const;
const SCRIPT_OPENING_BANNED_PREFIXES = ["안녕하세요", "오늘은", "이번 영상은", "지금부터"] as const;
const TOPIC_BANNED_EXAGGERATION_TOKENS = ["무조건", "100%", "큰일", "바로 처벌", "무조건 패소", "벌금 확정"] as const;
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const CATEGORY_TONE_PROFILES: CategoryToneProfile[] = [
  {
    key: "conservative",
    match: ["conservative", "보수", "우익", "right"],
    prompt: "톤은 직설적이고 단호하게 잡되, 과장 대신 사실 포인트를 빠르게 찍는다.",
  },
  {
    key: "progressive",
    match: ["progressive", "진보", "left", "복지", "노동", "민생"],
    prompt: "톤은 차분하지만 선명하게 잡고, 사람들에게 미치는 영향과 쟁점을 먼저 짚는다.",
  },
  {
    key: "economy",
    match: ["경제", "금융", "주식", "코인", "부동산", "세무", "회계", "tax", "accounting", "finance", "stock", "business", "market"],
    prompt: "톤은 분석적이고 계산적으로 잡고, 숫자감과 손익 포인트를 짧게 정리한다.",
  },
  {
    key: "sports",
    match: ["스포츠", "축구", "야구", "농구", "골프", "sports", "football", "baseball", "soccer"],
    prompt: "톤은 빠르고 에너지 있게 잡되, 흥분보다 장면과 승부 포인트를 먼저 전달한다.",
  },
  {
    key: "entertainment",
    match: ["연예", "엔터", "드라마", "영화", "아이돌", "kpop", "celeb", "entertainment"],
    prompt: "톤은 대화체로 가볍게 잡되, 가십처럼 흐리지 말고 포인트를 또렷하게 말한다.",
  },
  {
    key: "knowledge",
    match: ["과학", "기술", "ai", "테크", "지식", "교육", "science", "tech", "history"],
    prompt: "톤은 호기심을 자극하는 설명형으로 잡고, 어렵지 않게 핵심 원리를 풀어낸다.",
  },
  {
    key: "legal",
    match: ["소송", "변호", "형사", "민사", "법률", "law", "attorney", "claim"],
    prompt: "톤은 법률 상담 연결형으로 잡고, 현실적인 쟁점과 증거 포인트를 바로 보여준다.",
  },
];

function normalizeScriptWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripListPrefix(line: string): string {
  return line.replace(/^\s*(?:[-*•]+|\d+[.)])\s+/, "");
}

function splitBySentenceBoundary(text: string): string[] {
  return normalizeScriptWhitespace(text)
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((line) => normalizeScriptWhitespace(line))
    .filter(Boolean);
}

function toCharLength(text: string): number {
  return normalizeScriptWhitespace(text).length;
}

function toComparableText(text: string): string {
  return normalizeScriptWhitespace(text);
}

function containsAnyToken(text: string, tokens: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.some((token) => lower.includes(token.toLowerCase()));
}

function normalizeGeneratedScript(raw: string): string {
  if (!raw) return "";
  const plain = raw
    .trim()
    .replace(/^\s*```(?:text|plain)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  return splitBySentenceBoundary(normalizeScriptWhitespace(stripListPrefix(plain)))
    .map((line) => normalizeScriptWhitespace(stripListPrefix(line)))
    .filter(Boolean)
    .join("\n");
}

function toScriptLines(script: string): string[] {
  if (!script) return [];
  const plain = script
    .trim()
    .replace(/^\s*```(?:text|plain)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  return plain
    .split(/\r?\n/)
    .map((line) => normalizeScriptWhitespace(line))
    .filter(Boolean);
}

type ScriptStructure = {
  lines: string[];
  title: string;
  bodyLines: string[];
  cta: string;
  bodyText: string;
};

export function toScriptStructure(script: string): ScriptStructure {
  const lines = toScriptLines(script);
  return {
    lines,
    title: lines[0] || "",
    bodyLines: lines.slice(1),
    cta: lines.length > 1 ? lines[lines.length - 1] : "",
    bodyText: toComparableText(lines.slice(1).join(" ")),
  };
}

export function resolveCategoryToneProfile(publishCategory?: PublishCategory, topic?: string): CategoryToneProfile {
  const haystack = `${publishCategory || ""} ${topic || ""}`.toLowerCase();
  return CATEGORY_TONE_PROFILES.find((profile) => profile.match.some((token) => haystack.includes(token))) || CATEGORY_TONE_PROFILES[CATEGORY_TONE_PROFILES.length - 1];
}

function looksLikeStrongHook(line: string): boolean {
  const trimmed = normalizeScriptWhitespace(line);
  if (!trimmed) return false;
  const charLength = toCharLength(trimmed);
  if (charLength < TOPIC_HOOK_MIN_CHARS || charLength > TOPIC_HOOK_MAX_CHARS) return false;
  if (containsAnyToken(trimmed, CTA_ACTION_TOKENS)) return false;
  if (SCRIPT_OPENING_BANNED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return false;
  if (/[?!？！]/.test(trimmed)) return true;
  return HOOK_SIGNAL_TOKENS.some((token) => trimmed.includes(token));
}

function looksLikeStrongCta(line: string): boolean {
  const trimmed = normalizeScriptWhitespace(line);
  if (!trimmed) return false;
  const charLength = toCharLength(trimmed);
  if (charLength < TOPIC_CTA_MIN_CHARS || charLength > TOPIC_CTA_MAX_CHARS) return false;
  if (!containsAnyToken(trimmed, CTA_ACTION_TOKENS)) return false;
  if (containsAnyToken(trimmed, ["상담", "문의", "오픈카톡", "카톡", "dm", "디엠", "연락"])) return true;
  return containsAnyToken(trimmed, CTA_RESPONSE_TOKENS) || /[?？]/.test(trimmed);
}

function looksLikeCtaLeak(line: string): boolean {
  const trimmed = normalizeScriptWhitespace(line);
  if (!containsAnyToken(trimmed, CTA_ACTION_TOKENS)) return false;
  return containsAnyToken(trimmed, CTA_IMPERATIVE_TOKENS) || containsAnyToken(trimmed, CTA_RESPONSE_TOKENS) || /[?？]/.test(trimmed);
}

function hasFormattingLeak(text: string): boolean {
  if (!text) return false;
  return /```/.test(text) || /(^|\n)\s*(?:[-*•]+|\d+[.)])\s+/.test(text) || /(^|\n)\s*(?:title|slidetexts)\s*:/i.test(text);
}

function countQuotedPhrases(text: string): number {
  const matched = text.match(/["“][^"“”]+["”]/g);
  return matched ? matched.length : 0;
}

function splitBodyLineForReadability(line: string): string[] {
  const normalized = normalizeScriptWhitespace(line);
  if (!normalized) return [];
  const sentences = splitBySentenceBoundary(normalized);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const trimmed = normalizeScriptWhitespace(sentence);
    if (!trimmed) continue;
    if (toCharLength(trimmed) <= TOPIC_BODY_MAX_CHARS) {
      chunks.push(trimmed);
      continue;
    }
    const parts = trimmed.split(/(?<=\s)/u).map((part) => normalizeScriptWhitespace(part)).filter(Boolean);
    for (const part of parts) {
      if (toCharLength(part) <= TOPIC_BODY_MAX_CHARS) {
        chunks.push(part);
      }
    }
  }
  return chunks;
}

function mergeBodyLinesToLimit(lines: string[], maxLines: number): string[] {
  const next = lines.map((line) => normalizeScriptWhitespace(line)).filter(Boolean);
  while (next.length > maxLines) {
    let merged = false;
    for (let index = 0; index < next.length - 1; index += 1) {
      const candidate = normalizeScriptWhitespace(`${next[index]} ${next[index + 1]}`);
      if (toCharLength(candidate) <= TOPIC_BODY_MAX_CHARS) {
        next.splice(index, 2, candidate);
        merged = true;
        break;
      }
    }
    if (merged) continue;
    const last = next.pop() || "";
    next[next.length - 1] = normalizeScriptWhitespace(`${next[next.length - 1]} ${last}`);
  }
  return next;
}

function chooseCtaLine(primary: string, leaked: string[]): string {
  const base = normalizeScriptWhitespace(primary);
  if (looksLikeStrongCta(base)) return base;
  const candidate = leaked.find((line) => looksLikeStrongCta(line));
  if (candidate) return normalizeScriptWhitespace(candidate);
  return base;
}

function summarizeTopicForHook(topic: string): string {
  const normalized = normalizeScriptWhitespace(topic).replace(/[?!.]+$/g, "");
  const chars = Array.from(normalized);
  if (chars.length <= 18) return normalized;
  return `${chars.slice(0, 18).join("")}...`;
}

export function buildTopicScriptSystemPrompt(
  publishCategory?: PublishCategory,
  topic?: string,
  mode: DialogueMode = "normal"
): string {
  const tone = resolveCategoryToneProfile(publishCategory, topic);
  const outputRule =
    mode === "dialogue"
      ? "출력은 대본 원문만 반환한다. 제목, 해설, 해시태그, 이모지, 불릿, JSON, 코드블록 금지. 따옴표 대사는 허용하고 적극 사용한다."
      : "출력은 대본 원문만 반환한다. 제목, 해설, 해시태그, 이모지, 불릿, JSON, 코드블록 금지.";
  const dialogueRules =
    mode === "dialogue"
      ? [
          "대화형 규칙:",
          '12) 전체 문장 중 최소 2문장은 따옴표("...") 대사로 작성한다.',
          "13) 대사 화자가 보이면 `화자이름: 대사` 형태를 따옴표 안에 넣는다. 예: \"민수: 이거 진짜야?\"",
          "14) 따옴표 밖 문장은 나레이션으로 유지한다.",
          "15) 마지막 CTA에서도 필요하면 짧은 인용 1개를 쓸 수 있다.",
        ]
      : [];
  return [
    "너는 한국어 쇼츠 대본 카피라이터다.",
    outputRule,
    "형식 규칙:",
    `1) 반말, 전체 ${TOPIC_SCRIPT_MIN_LINES}~${TOPIC_SCRIPT_MAX_LINES}문장, 공백 포함 ${TOPIC_SCRIPT_MIN_TOTAL_CHARS}~${TOPIC_SCRIPT_MAX_TOTAL_CHARS}자.`,
    `2) 첫 문장은 hook. ${TOPIC_HOOK_MIN_CHARS}~${TOPIC_HOOK_MAX_CHARS}자 안에서 의심, 반박, 충격 포인트 중 하나로 시작한다.`,
    `3) body는 ${TOPIC_SCRIPT_MIN_BODY_LINES}~${TOPIC_SCRIPT_MAX_BODY_LINES}문장 권장. 각 문장은 ${TOPIC_BODY_MIN_CHARS}~${TOPIC_BODY_MAX_CHARS}자 범위에서 짧고 읽기 쉽게 쓴다.`,
    `4) 마지막 문장은 CTA. ${TOPIC_CTA_MIN_CHARS}~${TOPIC_CTA_MAX_CHARS}자 안에서 상담 문의, DM, 오픈카톡 유도 중 하나를 자연스럽게 넣는다.`,
    "품질 기준:",
    "5) 첫 문장 뒤에는 사람들이 보통 하는 생각을 인정하는 공감 1~2문장을 둔다.",
    "6) 본문에는 판단 기준을 3개 이상 넣되 1,2,3 번호 나열처럼 쓰지 않는다.",
    "7) 쉬운 실제 상황 예시 1개와 사람들이 자주 하는 반박 1개를 부드럽게 반박하는 문장을 포함한다.",
    "8) 과장, 협박, 확정적 단정, 어려운 용어 남발 금지.",
    ...dialogueRules,
    `카테고리 톤: ${tone.prompt}`,
    "실제 숏폼처럼 말로 읽기 쉽게 쓰고, 시청자가 '이건 내 상황인데'라고 느끼게 써라.",
  ].join("\n");
}

export function buildTopicScriptUserPrompt(
  topic: string,
  publishCategory?: PublishCategory,
  promptTemplate?: string,
  mode: DialogueMode = "normal"
): string {
  const base = renderTopicToScriptPromptTemplate({
    topic,
    publishCategory,
    template: promptTemplate,
  });
  if (mode !== "dialogue") return base;
  return [
    base,
    "",
    "[추가 모드 규칙]",
    "현재 mode=dialogue다.",
    '반드시 따옴표 대사("...")를 최소 2개 포함하고, 화자가 구분되면 `화자이름: 대사` 형식을 사용한다.',
    "따옴표 밖 문장은 나레이션으로 유지한다.",
  ].join("\n");
}

export function validateTopicScriptDraft(script: string, mode: DialogueMode = "normal"): ScriptQualityIssue[] {
  const normalized = normalizeGeneratedScript(script);
  const structure = toScriptStructure(script);
  const bodyLines = structure.lines.slice(1, -1);
  const totalChars = toCharLength(structure.lines.join(" "));
  const issues: ScriptQualityIssue[] = [];

  if (!normalized) {
    return [
      {
        code: "output.empty",
        message: "output.empty: 대본 본문이 비었습니다. 대본 원문만 다시 작성하세요.",
      },
    ];
  }

  if (hasFormattingLeak(script) || hasFormattingLeak(normalized)) {
    issues.push({
      code: "format.scaffold",
      message: "format.scaffold: 번호, 마크다운, 필드명 없이 대본 원문만 반환해야 합니다.",
    });
  }
  if (EMOJI_REGEX.test(normalized) || normalized.includes("#")) {
    issues.push({
      code: "format.emoji_or_hashtag",
      message: "format.emoji_or_hashtag: 이모지와 해시태그는 금지입니다.",
    });
  }
  if (totalChars < TOPIC_SCRIPT_MIN_TOTAL_CHARS || totalChars > TOPIC_SCRIPT_MAX_TOTAL_CHARS) {
    issues.push({
      code: "format.total_chars",
      message: `format.total_chars: 공백 포함 ${TOPIC_SCRIPT_MIN_TOTAL_CHARS}~${TOPIC_SCRIPT_MAX_TOTAL_CHARS}자로 맞추세요. 현재 ${totalChars}자입니다.`,
    });
  }
  if (structure.lines.length < TOPIC_SCRIPT_MIN_LINES || structure.lines.length > TOPIC_SCRIPT_MAX_LINES) {
    issues.push({
      code: "format.line_count",
      message: `format.line_count: 현재 ${structure.lines.length}문장입니다. hook 1문장, body ${TOPIC_SCRIPT_MIN_BODY_LINES}~${TOPIC_SCRIPT_MAX_BODY_LINES}문장, CTA 1문장 흐름으로 ${TOPIC_SCRIPT_MIN_LINES}~${TOPIC_SCRIPT_MAX_LINES}문장을 맞추세요.`,
    });
  }
  if (new Set(structure.lines.map((line) => toComparableText(line))).size !== structure.lines.length) {
    issues.push({
      code: "content.duplicate_line",
      message: "content.duplicate_line: 같은 문장이 반복되고 있습니다. 각 줄을 다른 정보로 분리하세요.",
    });
  }
  if (containsAnyToken(normalized, TOPIC_BANNED_EXAGGERATION_TOKENS)) {
    issues.push({
      code: "content.banned_exaggeration",
      message: "content.banned_exaggeration: 무조건, 100%, 바로 처벌 같은 과장/협박 표현은 금지입니다.",
    });
  }
  if (mode === "dialogue" && countQuotedPhrases(normalized) < 2) {
    issues.push({
      code: "dialogue.quote_missing",
      message: "dialogue.quote_missing: dialogue 모드는 따옴표 대사를 최소 2개 포함해야 합니다.",
    });
  }

  const hook = structure.title;
  if (!hook) {
    issues.push({
      code: "hook.missing",
      message: "hook.missing: 첫 줄 hook이 비어 있습니다.",
    });
  } else {
    if (toCharLength(hook) < TOPIC_HOOK_MIN_CHARS || toCharLength(hook) > TOPIC_HOOK_MAX_CHARS) {
      issues.push({
        code: "hook.length",
        message: `hook.length: 첫 줄은 ${TOPIC_HOOK_MIN_CHARS}~${TOPIC_HOOK_MAX_CHARS}자 안이 좋습니다. 현재 ${toCharLength(hook)}자입니다. 현재="${hook}"`,
      });
    }
    if (splitBySentenceBoundary(hook).length > 1 && /[.!?。！？]/.test(hook)) {
      issues.push({
        code: "hook.multi_sentence",
        message: `hook.multi_sentence: 첫 줄 hook은 한 문장으로 끝내세요. 현재="${hook}"`,
      });
    }
    if (!looksLikeStrongHook(hook)) {
      issues.push({
        code: "hook.first_line_weak",
        message: `hook.first_line_weak: 첫 줄이 약합니다. 질문, 반전, 직접 경고 중 하나로 더 짧고 강하게 다시 쓰세요. 현재="${hook}"`,
      });
    }
  }

  if (bodyLines.length < TOPIC_SCRIPT_MIN_BODY_LINES || bodyLines.length > TOPIC_SCRIPT_MAX_BODY_LINES) {
    issues.push({
      code: "body.line_count",
      message: `body.line_count: body는 ${TOPIC_SCRIPT_MIN_BODY_LINES}~${TOPIC_SCRIPT_MAX_BODY_LINES}줄이어야 합니다. 현재 ${bodyLines.length}줄입니다.`,
    });
  }
  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index];
    const charLength = toCharLength(line);
    if (charLength < TOPIC_BODY_MIN_CHARS) {
      issues.push({
        code: `body.line_${index + 2}_too_short`,
        message: `body.line_${index + 2}_too_short: ${index + 2}번째 줄이 ${charLength}자로 너무 짧습니다. 정보 한 포인트를 분명하게 말하세요. 현재="${line}"`,
      });
    }
    if (charLength > TOPIC_BODY_MAX_CHARS) {
      issues.push({
        code: `body.line_${index + 2}_too_long`,
        message: `body.line_${index + 2}_too_long: ${index + 2}번째 줄이 ${charLength}자로 길어요. 말로 읽기 쉽게 줄이세요. 현재="${line}"`,
      });
    }
    if (splitBySentenceBoundary(line).length > 1 && /[.!?。！？]/.test(line)) {
      issues.push({
        code: `body.line_${index + 2}_multi_sentence`,
        message: `body.line_${index + 2}_multi_sentence: ${index + 2}번째 줄은 한 문장만 허용합니다. 현재="${line}"`,
      });
    }
    if (looksLikeCtaLeak(line)) {
      issues.push({
        code: `body.line_${index + 2}_cta_leak`,
        message: `body.line_${index + 2}_cta_leak: CTA 문구는 마지막 줄에만 있어야 합니다. 현재="${line}"`,
      });
    }
  }

  const cta = structure.cta;
  if (!cta) {
    issues.push({
      code: "cta.missing",
      message: "cta.missing: 마지막 CTA 줄이 비어 있습니다.",
    });
  } else {
    if (!looksLikeStrongCta(cta)) {
      issues.push({
        code: "cta.last_line_weak",
        message: `cta.last_line_weak: 마지막 줄은 상담 문의, 오픈카톡, DM 유도 같은 CTA가 자연스럽게 들어가야 합니다. 현재="${cta}"`,
      });
    }
    if (splitBySentenceBoundary(cta).length > 2) {
      issues.push({
        code: "cta.too_long",
        message: `cta.too_long: CTA는 짧고 자연스럽게 끝내세요. 현재="${cta}"`,
      });
    }
  }

  return issues;
}

export function autoRepairTopicScriptDraft(script: string): string {
  const structure = toScriptStructure(script);
  if (!structure.title || structure.lines.length < 2) return normalizeGeneratedScript(script);

  const leakedCtas: string[] = [];
  const bodyParts: string[] = [];
  for (const line of structure.bodyLines.slice(0, -1)) {
    const normalized = normalizeScriptWhitespace(line);
    if (!normalized) continue;
    if (looksLikeCtaLeak(normalized)) {
      leakedCtas.push(normalized);
      continue;
    }
    bodyParts.push(...splitBodyLineForReadability(normalized));
  }

  let body = bodyParts.filter(Boolean);
  if (body.length < TOPIC_SCRIPT_MIN_BODY_LINES) {
    for (const leaked of leakedCtas) {
      if (body.length >= TOPIC_SCRIPT_MIN_BODY_LINES) break;
      body.push(leaked);
    }
  }
  if (body.length > TOPIC_SCRIPT_MAX_BODY_LINES) {
    body = mergeBodyLinesToLimit(body, TOPIC_SCRIPT_MAX_BODY_LINES);
  }
  if (body.length <= 0) {
    body = structure.bodyLines.slice(0, -1).map((line) => normalizeScriptWhitespace(line)).filter(Boolean);
  }

  const cta = chooseCtaLine(structure.cta, leakedCtas);
  const repaired = [structure.title, ...body, cta].map((line) => normalizeScriptWhitespace(line)).filter(Boolean).join("\n");
  return normalizeGeneratedScript(repaired);
}

export function formatIssuesForPrompt(issues: ScriptQualityIssue[]): string {
  return issues.map((issue) => `- ${issue.message}`).join("\n");
}

export function summarizeIssues(issues: ScriptQualityIssue[]): string {
  return issues
    .slice(0, 6)
    .map((issue) => issue.message)
    .join(" | ");
}

export function buildTopicScriptRepairUserPrompt(
  topic: string,
  publishCategory: PublishCategory | undefined,
  previousScript: string,
  issues: ScriptQualityIssue[],
  promptTemplate?: string,
  mode: DialogueMode = "normal"
): string {
  const categoryLine = publishCategory ? `카테고리: ${publishCategory}` : "카테고리: default";
  const previous = normalizeGeneratedScript(previousScript) || previousScript.trim() || "(empty)";
  const modeLine = `mode: ${mode}`;
  const dialogueRepairRules =
    mode === "dialogue"
      ? [
          "7. 따옴표 대사를 최소 2개 포함",
          "8. 화자가 보이면 따옴표 안에 `화자이름: 대사` 형식을 사용",
          "9. 따옴표 밖 문장은 나레이션으로 유지",
        ]
      : [];
  return [
    categoryLine,
    modeLine,
    `[주제]\n${topic.trim()}`,
    `[기본 프롬프트]\n${buildTopicScriptUserPrompt(topic, publishCategory, promptTemplate, mode)}`,
    `[직전 시도]\n${previous}`,
    `[검증 실패]\n${formatIssuesForPrompt(issues)}`,
    "[다시 작성 규칙]",
    `1. 공백 포함 ${TOPIC_SCRIPT_MIN_TOTAL_CHARS}~${TOPIC_SCRIPT_MAX_TOTAL_CHARS}자`,
    `2. ${TOPIC_SCRIPT_MIN_LINES}~${TOPIC_SCRIPT_MAX_LINES}문장 흐름 유지`,
    `3. 첫 문장 hook은 ${TOPIC_HOOK_MIN_CHARS}~${TOPIC_HOOK_MAX_CHARS}자 안에서 더 강하게`,
    `4. body는 ${TOPIC_SCRIPT_MIN_BODY_LINES}~${TOPIC_SCRIPT_MAX_BODY_LINES}문장, 공감과 판단 기준 3개 이상, 실제 상황 예시 1개, 흔한 반박 1개를 포함`,
    "5. 마지막 문장은 상담 문의, DM, 오픈카톡 유도 CTA로 마무리",
    "6. 제목, 해설, 해시태그, 이모지, 불릿, JSON 없이 대본 원문만 반환",
    ...dialogueRepairRules,
  ].join("\n\n");
}

export function buildFallbackTopicScript(
  topic: string,
  publishCategory?: PublishCategory,
  mode: DialogueMode = "normal"
): string {
  const safeTopic = normalizeScriptWhitespace(topic) || "이 주제";
  const hookTopic = summarizeTopicForHook(safeTopic);
  const serviceLabel = (publishCategory ? normalizeScriptWhitespace(publishCategory) : "") || "전문가";
  const tone = resolveCategoryToneProfile(publishCategory, topic);
  const criteriaLine =
    tone.key === "economy"
      ? "근데 실제 답은 매출, 비용, 세금, 현금흐름처럼 숫자를 같이 봐야 달라져."
      : tone.key === "legal"
        ? "근데 실제 답은 증거, 일정, 말 바뀐 기록처럼 기준을 같이 봐야 달라져."
        : "근데 실제 답은 상황, 숫자, 기준 자료를 같이 봐야 달라져.";
  const exampleLine =
    tone.key === "economy"
      ? "예를 들어 하나만 유리해 보여도 몇 달 뒤 세금이나 비용까지 합치면 결과가 뒤집히는 경우가 많아."
      : "예를 들어 지금 급하다고 한 가지만 보고 정하면, 나중에 비용이나 책임이 더 커질 수 있어.";
  const rebuttalLine =
    tone.key === "economy"
      ? "다들 이렇게 한다는 말보다 내 회사 구조와 내 조건으로 비교해야 진짜 손해를 막을 수 있어."
      : "남들도 이렇게 했다는 말보다 내 조건으로 직접 비교해야 진짜 손해를 막을 수 있어.";
  const normalLines = [
    `${hookTopic}, 감으로 정하면 손해 볼 수 있어.`,
    "인터넷에서 본 한 줄 팁만 믿고 빨리 정하고 싶을 때 많지.",
    criteriaLine,
    exampleLine,
    rebuttalLine,
    `${serviceLabel} 기준으로 어디가 적정선인지 바로 잡고 싶으면 지금 상담 문의해.`,
  ];
  const dialogueLines = [
    `${hookTopic}, 감으로 정하면 손해 볼 수 있어.`,
    '"이거 그냥 빨리 정하면 되는 거 아니야?"',
    `${criteriaLine.replace(/\.$/, "")} 그래야 뒤에서 안 꼬여.`,
    exampleLine,
    '"남들도 이렇게 한다" 싶어도 내 조건은 다 다르니까 그대로 따라가면 안 돼.',
    `${serviceLabel} 기준으로 어디가 적정선인지 바로 잡고 싶으면 지금 상담 문의해.`,
  ];
  const candidate = (mode === "dialogue" ? dialogueLines : normalLines).join("\n");
  const repaired = autoRepairTopicScriptDraft(candidate);
  return normalizeGeneratedScript(repaired || candidate);
}
