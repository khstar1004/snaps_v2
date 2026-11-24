import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE,
  DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE,
  renderScriptToJsonPromptTemplate,
  renderTopicToScriptPromptTemplate,
} from "./prompt-templates";

test("default topic-to-script template stays generic and category-aware", () => {
  assert.match(DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE, /\{\{publishCategory\}\}/);
  assert.match(DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE, /\{\{topic\}\}/);
  assert.doesNotMatch(DEFAULT_TOPIC_TO_SCRIPT_PROMPT_TEMPLATE, /변호사|법률 상담사건 의뢰/);
});

test("renderTopicToScriptPromptTemplate injects category and topic", () => {
  const rendered = renderTopicToScriptPromptTemplate({
    publishCategory: "칠도세무회계",
    topic: "법인 대표 급여",
  });

  assert.match(rendered, /칠도세무회계/);
  assert.match(rendered, /법인 대표 급여/);
});

test("default script-to-json template stays compact and schema-driven", () => {
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /\{"title":"첫 줄 그대로"/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /lineTokenRanges/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /line은 뒤에 제공되는 최종 줄 폭 예산을 만족/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /한글·한자·영문·괄호·공백을 모두 줄 폭에 포함/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /인용문 전체가 최종 줄 폭 예산 안에 들면 반드시 한 line/);
  assert.doesNotMatch(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /괄호 속 한자.*제외/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /수 있어.*핵심 동사/);
  assert.match(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /imageRequest, imageBeats, imageUrl 같은 이미지 관련 필드는 절대 넣지 않는다/);
  assert.doesNotMatch(DEFAULT_SCRIPT_TO_JSON_PROMPT_TEMPLATE, /출력 전 필수 검증/);
});

test("renderScriptToJsonPromptTemplate injects the source script", () => {
  const rendered = renderScriptToJsonPromptTemplate({
    publishCategory: "칠도세무회계",
    script: "첫 줄\n둘째 줄",
  });

  assert.match(rendered, /첫 줄/);
  assert.match(rendered, /둘째 줄/);
});
