import assert from "node:assert/strict";
import test from "node:test";
import {
  autoRepairTopicScriptDraft,
  buildFallbackTopicScript,
  buildTopicScriptRepairUserPrompt,
  buildTopicScriptSystemPrompt,
  buildTopicScriptUserPrompt,
  resolveCategoryToneProfile,
  summarizeIssues,
  validateTopicScriptDraft,
} from "./codex-topic-script";

test("buildTopicScriptSystemPrompt reflects category tone and dialogue rules", () => {
  const prompt = buildTopicScriptSystemPrompt("legal", "계약 분쟁", "dialogue");

  assert.match(prompt, /한국어 쇼츠 대본 카피라이터/);
  assert.match(prompt, /대화형 규칙/);
  assert.match(prompt, /카테고리 톤:/);
});

test("buildTopicScriptUserPrompt adds dialogue-only guidance when requested", () => {
  const prompt = buildTopicScriptUserPrompt("계약 분쟁", "legal", "사용자 규칙: {{topic}}로 시작", "dialogue");

  assert.match(prompt, /사용자 규칙: 계약 분쟁로 시작/);
  assert.match(prompt, /추가 모드 규칙/);
  assert.match(prompt, /화자이름: 대사/);
});

test("validateTopicScriptDraft reports structural issues for underspecified drafts", () => {
  const issues = validateTopicScriptDraft("지금 문제입니다.\n상대가 책임을 미룹니다.\n마지막 줄입니다.");
  const codes = issues.map((issue) => issue.code);

  assert.ok(codes.includes("format.total_chars"));
  assert.ok(codes.includes("format.line_count"));
  assert.ok(codes.includes("body.line_count"));
  assert.ok(codes.includes("cta.last_line_weak"));
});

test("resolveCategoryToneProfile prefers the matching legal tone profile", () => {
  const profile = resolveCategoryToneProfile("legal", "계약 분쟁");

  assert.equal(profile.key, "legal");
  assert.match(profile.prompt, /법률 상담 연결형/);
});

test("resolveCategoryToneProfile does not misclassify tax or accounting topics as legal", () => {
  const profile = resolveCategoryToneProfile("칠도세무회계", "법인 대표 급여");

  assert.equal(profile.key, "economy");
  assert.match(profile.prompt, /손익 포인트/);
});

test("autoRepairTopicScriptDraft keeps the final CTA line intact", () => {
  const repaired = autoRepairTopicScriptDraft([
    "지금 이 상황, 그냥 넘기면 손해입니다",
    "상담 문의는 지금 DM 주세요.",
    "상대가 말을 바꾸면 기록이 더 중요해집니다.",
    "초기에 정리한 증거가 결과를 바꿉니다.",
    "혼자 판단하기 애매한 장면이 많습니다.",
    "마지막 줄은 상담 문의로 끝납니다.",
  ].join("\n"));

  const lines = repaired.split("\n").filter(Boolean);
  assert.ok(lines.length >= 2);
  assert.match(lines.at(-1) || "", /상담 문의/);
});

test("buildTopicScriptRepairUserPrompt summarizes validation failures", () => {
  const issues = validateTopicScriptDraft("지금 문제입니다.\n상대가 책임을 미룹니다.\n마지막 줄입니다.");
  const prompt = buildTopicScriptRepairUserPrompt(
    "계약 분쟁",
    "legal",
    "지금 문제입니다.\n상대가 책임을 미룹니다.\n마지막 줄입니다.",
    issues,
    "사용자 규칙: {{topic}}로 시작",
    "normal"
  );

  assert.match(prompt, /\[검증 실패\]/);
  assert.match(prompt, /사용자 규칙: 계약 분쟁로 시작/);
  assert.match(prompt, /공백 포함 300~400자/);
  assert.match(summarizeIssues(issues), /format\.total_chars/);
});

test("buildFallbackTopicScript returns a usable six-line CTA script", () => {
  const script = buildFallbackTopicScript("법인 대표 급여를 어떻게 정해야 세금이 덜 나오는지", "칠도세무회계");
  const lines = script.split("\n").filter(Boolean);

  assert.equal(lines.length, 6);
  assert.match(lines.at(-1) || "", /상담 문의/);
});
