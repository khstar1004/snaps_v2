import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeterministicScriptToJson,
  buildScriptToJsonRepairUserPrompt,
  buildScriptToJsonSystemPrompt,
  buildScriptToJsonUserPrompt,
  parseScriptToJsonResult,
  toStudioPayloadFromScriptToJson,
} from "./codex-script-to-json";
import { createCaptionLayoutPolicy } from "./caption-layout";

test("buildScriptToJsonSystemPrompt reflects dialogue-specific rules", () => {
  const prompt = buildScriptToJsonSystemPrompt("dialogue");

  assert.match(prompt, /dialogue 모드 허용 필드/);
  assert.match(prompt, /dialogueSegments/);
  assert.match(prompt, /lineTokenRanges/);
  assert.match(prompt, /그래서 오늘은/);
  assert.match(prompt, /인용문 전체가 한 줄 최대 12자.*안에 들면 반드시/);
  assert.match(prompt, /한글·한자·영문·괄호·공백을 모두 줄 폭에 포함/);
  assert.match(prompt, /수 있어.*핵심 동사/);
  assert.match(prompt, /달 월\(月\).*한자 풀이 쌍/);
  assert.match(prompt, /male_1, female_1, unknown_1/);
  assert.match(prompt, /imageRequest, imageBeats, imageUrl 등 이미지 관련 필드는 출력하지 않는다/);
});

test("buildScriptToJsonUserPrompt injects the rendered prompt template", () => {
  const prompt = buildScriptToJsonUserPrompt("후크\n본문", "legal", "규칙: {{script}}", "dialogue");

  assert.match(prompt, /규칙: 후크\n본문/);
  assert.match(prompt, /\[본문 토큰\]/);
  assert.match(prompt, /t0="본문"/);
  assert.match(prompt, /추가 모드 규칙/);
});

test("buildScriptToJsonUserPrompt includes the normalized render-width budget and token widths", () => {
  const captionLayoutPolicy = createCaptionLayoutPolicy({
    templateId: "default",
    templateData: { bodyScale: 1 },
    templateImageEnabled: true,
    templateImageLayout: {
      bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
      bodySize: 16,
    },
  });
  const prompt = buildScriptToJsonUserPrompt(
    "제목\n달 월(月)",
    undefined,
    undefined,
    "normal",
    captionLayoutPolicy,
  );

  assert.match(prompt, /한 줄 폭 예산 862px/);
  assert.match(prompt, /토큰별 표시 폭/);
  assert.match(prompt, /토큰 사이 공백 폭/);
});

test("parseScriptToJsonResult reconstructs exact text from natural token ranges", () => {
  const sourceScript = [
    "매일 같은 자리",
    "어느 날 내가 늦게 갔더니 그 자리에 다른 사람이 앉아있었음",
    "그래서 오늘은 밥을 먹었다",
  ].join("\n");
  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "매일 같은 자리",
      slides: [
        { lineTokenRanges: [[0, 2], [3, 4], [5, 7], [8, 9]] },
        { lineTokenRanges: [[10, 11], [12, 13]] },
      ],
    }),
    sourceScript
  );

  assert.equal(parsed.title, "매일 같은 자리");
  assert.deepEqual(parsed.slides[0]?.lines, ["어느 날 내가", "늦게 갔더니", "그 자리에 다른", "사람이 앉아있었음"]);
  assert.deepEqual(parsed.slides[1]?.lines, ["그래서 오늘은", "밥을 먹었다"]);
  assert.equal(
    parsed.slides.map((slide) => slide.text).join(" "),
    "어느 날 내가 늦게 갔더니 그 자리에 다른 사람이 앉아있었음 그래서 오늘은 밥을 먹었다"
  );
});

test("parseScriptToJsonResult rejects a clearly dangling page ending", () => {
  const sourceScript = [
    "매일 같은 자리",
    "어느 날 일이 끝났음 그래서 오늘은 밥을 먹었다 집에 갔다",
  ].join("\n");

  assert.throws(
    () =>
      parseScriptToJsonResult(
        JSON.stringify({
          title: "매일 같은 자리",
          slides: [
            { lineTokenRanges: [[0, 1], [2, 3], [4, 5]] },
            { lineTokenRanges: [[6, 7], [8, 9]] },
          ],
        }),
        sourceScript
      ),
    /미완성 연결 구절 "그래서 오늘은"/
  );
});

test("parseScriptToJsonResult rejects skipped or duplicated token ranges", () => {
  const sourceScript = "제목\n하나 둘 셋 넷 다섯";

  assert.throws(
    () =>
      parseScriptToJsonResult(
        JSON.stringify({
          title: "제목",
          slides: [{ lineTokenRanges: [[0, 1], [3, 4]] }],
        }),
        sourceScript
      ),
    /expectedStart=2 actualStart=3/
  );
});

test("parseScriptToJsonResult keeps a compact quoted phrase on one line", () => {
  const sourceScript = "제목\n옆에서 \"여기 앉으실래요?\" 하는데 그 여자였음";

  assert.throws(
    () =>
      parseScriptToJsonResult(
        JSON.stringify({
          title: "제목",
          slides: [{ lineTokenRanges: [[0, 1], [2, 2], [3, 5]] }],
        }),
        sourceScript
      ),
    /인용문.*여기 앉으실래요.*한 줄/
  );

  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "제목",
      slides: [{ lineTokenRanges: [[0, 0], [1, 2], [3, 5]] }],
    }),
    sourceScript
  );
  assert.deepEqual(parsed.slides[0]?.lines, ["옆에서", "\"여기 앉으실래요?\"", "하는데 그 여자였음"]);
});

test("parseScriptToJsonResult allows a quoted phrase over 12 characters to span lines", () => {
  const sourceScript = "제목\n\"힘내세요 커피 사왔어요\" 옆에 놓여있더라";
  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "제목",
      slides: [{ lineTokenRanges: [[0, 1], [2, 2], [3, 4]] }],
    }),
    sourceScript
  );

  assert.deepEqual(parsed.slides[0]?.lines, ["\"힘내세요 커피", "사왔어요\"", "옆에 놓여있더라"]);
});

test("parseScriptToJsonResult keeps a compact dependent predicate phrase on one line", () => {
  const sourceScript = "제목\n작년에 사업장 피해 있었으면 이것도 챙길 수 있어";

  assert.throws(
    () =>
      parseScriptToJsonResult(
        JSON.stringify({
          title: "제목",
          slides: [{ lineTokenRanges: [[0, 2], [3, 5], [6, 7]] }],
        }),
        sourceScript
      ),
    /의존 서술어 묶음.*챙길 수 있어.*한 줄/
  );

  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "제목",
      slides: [{ lineTokenRanges: [[0, 2], [3, 4], [5, 7]] }],
    }),
    sourceScript
  );
  assert.deepEqual(parsed.slides[0]?.lines, ["작년에 사업장 피해", "있었으면 이것도", "챙길 수 있어"]);
});

test("parseScriptToJsonResult keeps Hanja gloss pairs with their following explanation", () => {
  const sourceScript = "제목\n달 월(月) 불 화(火)\n뜻이 모두 달라요";
  const captionLayoutPolicy = createCaptionLayoutPolicy({
    templateId: "default",
    templateData: { bodyScale: 1 },
    templateImageEnabled: true,
    templateImageLayout: {
      bodySlot: { x: 0.05, y: 0.25, w: 0.9, h: 0.18 },
      bodySize: 16,
    },
  });

  assert.throws(
    () =>
      parseScriptToJsonResult(
        JSON.stringify({
          title: "제목",
          slides: [{ lineTokenRanges: [[0, 0], [1, 3], [4, 4], [5, 6]] }],
        }),
        sourceScript,
        undefined,
        captionLayoutPolicy,
      ),
    /한자 풀이 묶음.*달 월\(月\).*한 줄/
  );

  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "제목",
      slides: [{ lineTokenRanges: [[0, 3], [4, 6]] }],
    }),
    sourceScript,
    undefined,
    captionLayoutPolicy,
  );
  assert.deepEqual(parsed.slides[0]?.lines, ["달 월(月) 불 화(火)", "뜻이 모두 달라요"]);
});

test("parseScriptToJsonResult and payload conversion keep the script shape intact", () => {
  const sourceScript = [
    "후크.",
    "첫 문장.",
    "두 문장.",
    "세 문장.",
  ].join("\n");
  const parsed = parseScriptToJsonResult(
    JSON.stringify({
      title: "후크.",
      slides: [
        { text: "첫 문장. 두 문장.", lines: ["첫 문장.", "두 문장."] },
        { text: "세 문장.", lines: ["세", "문장."] },
      ],
    }),
    sourceScript
  );
  const payload = toStudioPayloadFromScriptToJson(parsed, "legal");

  assert.equal(parsed.title, "후크.");
  assert.equal(parsed.slides.length, 2);
  assert.equal(payload.mode, "normal");
  assert.equal(payload.slides.length, 2);
});

test("toStudioPayloadFromScriptToJson preserves dialogue-specific voice mapping", () => {
  const payload = toStudioPayloadFromScriptToJson(
    {
      title: "후크",
      mode: "dialogue",
      ttsSourceText: "첫 문장 대사",
      narrationVoice: "narration-voice",
      quoteVoice: "quote-voice",
      speakerVoices: { female_1: "speaker-voice" },
      slides: [
        {
          text: "첫 문장",
          lines: ["첫", "문장"],
          dialogueSegments: [
            { type: "narration", text: "첫 문장", voice: "narration-voice", speed: 0.85, pauseAfterMs: 120 },
          ],
        },
        {
          text: "대사",
          lines: ["대사"],
          dialogueSegments: [
            { type: "quote", text: "대사", speakerId: "female_1", voice: "speaker-voice", speed: 1.25, pauseAfterMs: 0 },
          ],
        },
      ],
    },
    "legal",
    "dialogue"
  );

  assert.equal(payload.mode, "dialogue");
  assert.equal(payload.speakerVoices?.female_1, "speaker-voice");
  assert.equal(payload.slides[1].dialogueSegments?.[0].voice, "speaker-voice");
  assert.equal(payload.slides[0].dialogueSegments?.[0].speed, 0.85);
  assert.equal(payload.slides[0].dialogueSegments?.[0].pauseAfterMs, 120);
  assert.equal(payload.slides[1].dialogueSegments?.[0].speed, 1.25);
  assert.equal(payload.slides[1].dialogueSegments?.[0].pauseAfterMs, 0);
});

test("toStudioPayloadFromScriptToJson keeps editable narration segments in normal mode", () => {
  const payload = toStudioPayloadFromScriptToJson(
    {
      title: "후크",
      mode: "normal",
      ttsSourceText: "첫 문장",
      slides: [
        {
          text: "첫 문장",
          lines: ["첫", "문장"],
          dialogueSegments: [
            { type: "narration", text: "첫 문장", speed: 1.15, pauseAfterMs: 0 },
          ],
        },
      ],
    },
    "legal",
    "normal"
  );

  assert.equal(payload.mode, "normal");
  assert.equal(payload.quoteVoice, undefined);
  assert.equal(payload.speakerVoices, undefined);
  assert.deepEqual(payload.slides[0]?.dialogueSegments?.map(({ type, text, speed, pauseAfterMs }) => ({
    type,
    text,
    speed,
    pauseAfterMs,
  })), [
    { type: "narration", text: "첫 문장", speed: 1.15, pauseAfterMs: 0 },
  ]);
});

test("buildScriptToJsonRepairUserPrompt summarizes the prior failure", () => {
  const prompt = buildScriptToJsonRepairUserPrompt(
    "후크\n첫 문장\n두 문장",
    "legal",
    '{"title":"후크"}',
    "slides가 비어 있습니다.",
    "규칙: {{script}}",
    "dialogue"
  );

  assert.match(prompt, /\[검증 실패\]/);
  assert.match(prompt, /slides가 비어 있습니다\./);
  assert.match(prompt, /규칙: 후크\n첫 문장\n두 문장/);
  assert.match(prompt, /lineTokenRanges/);
  assert.match(prompt, /imageRequest, imageBeats, imageUrl 같은 이미지 관련 필드는 넣지 말 것/);
});

test("buildDeterministicScriptToJson preserves title and body order", () => {
  const parsed = buildDeterministicScriptToJson([
    "후크",
    "법인 만들고 대표 급여를 얼마로 잡아야 할지 고민 많지?",
    "그냥 많이 잡으면 좋은 거 아니야?",
    "이렇게 생각하면 큰일 나",
    "대표 급여를 너무 높게 잡으면 소득세가 커져",
    "반대로 너무 낮추면 법인세 부담이 커질 수 있어",
    "결국 회사 상황에 맞는 균형점을 찾아야 해",
  ].join("\n"));

  assert.equal(parsed.title, "후크");
  assert.equal(parsed.slides.length > 0, true);
  assert.equal(
    parsed.slides.map((slide) => slide.text).join(" "),
    "법인 만들고 대표 급여를 얼마로 잡아야 할지 고민 많지? 그냥 많이 잡으면 좋은 거 아니야? 이렇게 생각하면 큰일 나 대표 급여를 너무 높게 잡으면 소득세가 커져 반대로 너무 낮추면 법인세 부담이 커질 수 있어 결국 회사 상황에 맞는 균형점을 찾아야 해"
  );
});
