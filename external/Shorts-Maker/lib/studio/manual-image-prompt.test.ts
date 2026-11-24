import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudioManualImagePrompt,
  buildStudioManualMascotBasePrompt,
  resolveManualImagePromptCharacterIds,
} from "./manual-image-prompt";
import type { PreparedSlide } from "@/types/studio-json";
import type { PublishMetadata } from "@/lib/publish/category-metadata";

function makeSlide(overrides?: Partial<PreparedSlide>): PreparedSlide {
  return {
    title: "오프닝",
    text: "정부 발표 내용을 빠르게 요약한다.",
    lines: ["정부 발표 내용을 빠르게 요약한다."],
    layout: "photo+body",
    ...overrides,
  };
}

test("buildStudioManualImagePrompt reflects mascot metadata and square/manual constraints", () => {
  const metadata: PublishMetadata = {
    description: "기본 설명",
    tags: ["뉴스"],
    ttsVoiceId: "",
    bgmEnabled: true,
    bgmTrackId: "bgm",
    mixPresetId: "mix",
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: "topic",
    scriptToJsonPrompt: "json",
    mascotName: "브리피",
    mascotDescription: "파란 재킷과 둥근 안경을 쓴 뉴스 브리핑 여우 캐릭터",
    mascotStyle: "깔끔한 editorial illustration, 선명한 실루엣",
    mascotTone: "시원한 블루와 시안 포인트, 차분한 라이트 톤",
    mascotNegativePrompt: "글자, 로고, 워터마크, 손가락 오류",
    mascotAnchorImageUrl: "https://assets.example.com/mascot.png",
  };

  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "도입",
      text: "긴급 발표 핵심 내용을 요약한다.",
    }),
    slideIndex: 0,
    totalSlides: 12,
    publishCategory: "news",
    metadata,
  });

  assert.equal(prompt.mascotName, "브리피");
  assert.equal(prompt.anchorImageUrl, "https://assets.example.com/mascot.png");
  assert.equal(prompt.usesFallbackMascot, false);
  assert.match(prompt.basePrompt, /same mascot identity/);
  assert.match(prompt.basePrompt, /exactly two arms/);
  assert.match(prompt.basePrompt, /square 1:1 composition/);
  assert.match(prompt.basePrompt, /no text/);
  assert.match(prompt.scenePrompt, /현재 슬라이드 핵심 상황/);
  assert.match(prompt.scenePrompt, /감정\/행동/);
  assert.match(prompt.finalPrompt, /\[Base character\/style prompt\]/);
  assert.match(prompt.finalPrompt, /\[Per-slide scene prompt\]/);
});

test("buildStudioManualImagePrompt falls back to category mascot defaults when metadata is empty", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "마무리",
      text: "구독과 알림 설정을 안내한다.",
    }),
    slideIndex: 9,
    totalSlides: 10,
    publishCategory: "default",
    metadata: null,
  });

  assert.equal(prompt.usesFallbackMascot, true);
  assert.match(prompt.mascotName, /기본/);
  assert.match(prompt.scenePrompt, /구독/);
  assert.match(prompt.scenePrompt, /square 1:1/);
});

test("buildStudioManualImagePrompt adds a single-pose guardrail for multitask scenes", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "회사원인데 배달 투잡도 뛰는 날",
      text: "회사 일과 배달 일을 동시에 소화하는 바쁜 하루를 설명한다.",
      lines: ["회사 일과 배달 일을 동시에 소화한다."],
      imageRequest: {
        query: "회사원 배달 투잡",
        scene: "사무용 책상, 배달 가방, 헬멧",
      },
    }),
    slideIndex: 2,
    totalSlides: 10,
    publishCategory: "default",
    metadata: null,
    scenePromptOverride:
      "마스코트가 사무용 책상 옆에서 움직이고, 책상 반대편에는 배달 가방과 헬멧이 놓인 장면. 투잡의 바쁜 일상이 읽히게 한다.",
  });

  assert.match(prompt.scenePrompt, /장면의 주연은 한 가지 핵심 동작만 수행한다/);
  assert.match(prompt.scenePrompt, /배경 소품으로만 암시/);
});

test("buildStudioManualImagePrompt uses work character profiles for multi-character story slides", () => {
  const metadata: PublishMetadata = {
    description: "기본 설명",
    tags: ["썰"],
    ttsVoiceId: "",
    bgmEnabled: true,
    bgmTrackId: "bgm",
    mixPresetId: "mix",
    sfxEnabled: true,
    sfxMasterGainDb: 2,
    templateNotes: "",
    topicToScriptPrompt: "topic",
    scriptToJsonPrompt: "json",
    mascotStyle: "밝은 웹툰풍 디지털 일러스트, 깨끗한 라인",
    mascotTone: "따뜻한 베이지와 민트 포인트",
  };

  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      text: "도서관에서 서로 처음 말을 거는 장면이다.",
      lines: ["도서관에서", "서로 처음 말을 건다."],
      dialogueSegments: [
        { type: "quote", speakerId: "male_1", text: "안녕하세요" },
        { type: "quote", speakerId: "female_1", text: "여기 앉으실래요?" },
      ],
    }),
    slideIndex: 1,
    totalSlides: 10,
    publishCategory: "story",
    metadata,
    characterProfiles: [
      {
        characterId: "male_1",
        displayName: "도서관 남자 주인공",
        identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 네이비 후드티, 수줍은 인상",
      },
      {
        characterId: "female_1",
        displayName: "도서관 여자 주인공",
        identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건, 차분한 미소",
      },
    ],
  });

  assert.deepEqual(prompt.characterIds, ["male_1", "female_1"]);
  assert.deepEqual(prompt.characterNames, ["도서관 남자 주인공", "도서관 여자 주인공"]);
  assert.match(prompt.basePrompt, /same art style across the project/);
  assert.match(prompt.basePrompt, /\[male_1\] 도서관 남자 주인공/);
  assert.match(prompt.basePrompt, /\[female_1\] 도서관 여자 주인공/);
  assert.match(prompt.scenePrompt, /등장 캐릭터: 도서관 남자 주인공 \/ 도서관 여자 주인공/);
});

test("buildStudioManualImagePrompt preserves a long fixed character identity prompt", () => {
  const identityPrompt = `${"detailed appearance ".repeat(24)}final appearance marker`;
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({ characterIds: ["hero"] }),
    slideIndex: 0,
    totalSlides: 1,
    publishCategory: "story",
    characterProfiles: [
      {
        characterId: "hero",
        displayName: "주인공",
        identityPrompt,
      },
    ],
  });

  assert.ok(prompt.basePrompt.includes(identityPrompt.trim()));
  assert.match(prompt.finalPrompt, /final appearance marker/);
});

test("buildStudioManualImagePrompt auto-generates stable per-work characters when profiles are omitted", () => {
  const slide = makeSlide({
    text: "도서관에서 서로 처음 말을 거는 장면이다.",
    lines: ["도서관에서", "서로 처음 말을 건다."],
    dialogueSegments: [
      { type: "quote", speakerId: "male_1", text: "안녕하세요" },
      { type: "quote", speakerId: "female_1", text: "여기 앉으실래요?" },
    ],
  });

  const promptA = buildStudioManualImagePrompt({
    slide,
    slideIndex: 1,
    totalSlides: 10,
    publishCategory: "story",
    metadata: {
      mascotStyle: "밝은 웹툰풍 디지털 일러스트, 깨끗한 라인",
      mascotTone: "따뜻한 베이지와 민트 포인트",
    },
    projectSeed: "story-seed-a",
  });
  const promptB = buildStudioManualImagePrompt({
    slide,
    slideIndex: 1,
    totalSlides: 10,
    publishCategory: "story",
    metadata: {
      mascotStyle: "밝은 웹툰풍 디지털 일러스트, 깨끗한 라인",
      mascotTone: "따뜻한 베이지와 민트 포인트",
    },
    projectSeed: "story-seed-a",
  });
  const promptC = buildStudioManualImagePrompt({
    slide,
    slideIndex: 1,
    totalSlides: 10,
    publishCategory: "story",
    metadata: {
      mascotStyle: "밝은 웹툰풍 디지털 일러스트, 깨끗한 라인",
      mascotTone: "따뜻한 베이지와 민트 포인트",
    },
    projectSeed: "story-seed-b",
  });

  assert.deepEqual(promptA.characterIds, ["male_1", "female_1"]);
  assert.deepEqual(promptA.characterNames, promptB.characterNames);
  assert.equal(promptA.basePrompt, promptB.basePrompt);
  assert.notEqual(promptA.basePrompt, promptC.basePrompt);
  assert.match(promptA.basePrompt, /\[male_1\]/);
  assert.match(promptA.basePrompt, /\[female_1\]/);
});

test("buildStudioManualImagePrompt preserves every explicitly selected scene character", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      characterIds: ["male_1", "female_1", "mentor_1"],
      text: "세 사람이 회의하는 장면",
    }),
    slideIndex: 0,
    totalSlides: 1,
    publishCategory: "story",
    characterProfiles: [
      { characterId: "male_1", displayName: "민수", identityPrompt: "검은 정장 남성" },
      { characterId: "female_1", displayName: "지수", identityPrompt: "베이지 재킷 여성" },
      { characterId: "mentor_1", displayName: "선생님", identityPrompt: "회색 머리 멘토" },
    ],
  });

  assert.deepEqual(prompt.characterIds, ["male_1", "female_1", "mentor_1"]);
  assert.match(prompt.scenePrompt, /민수 \/ 지수 \/ 선생님/);
  assert.match(prompt.basePrompt, /선택된 캐릭터를 모두 주연으로 사용하고 각자 서로 다른 외형을 유지한다/);
  assert.match(prompt.scenePrompt, /지정된 캐릭터를 모두 주연으로 등장시킨다/);
  assert.doesNotMatch(prompt.basePrompt, /두 명까지|최대 두 명/);
  assert.doesNotMatch(prompt.scenePrompt, /두 명까지|최대 두 명/);
});

test("buildStudioManualImagePrompt prefers a per-work image style prompt override", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      dialogueSegments: [{ type: "quote", speakerId: "male_1", text: "안녕하세요" }],
    }),
    slideIndex: 0,
    totalSlides: 5,
    publishCategory: "story",
    metadata: {
      mascotPrompt: "old preset style prompt",
      mascotStyle: "기본 스타일",
    },
    imageStylePrompt: "warm editorial illustration, soft daylight, no text, square 1:1",
    projectSeed: "style-override-seed",
  });

  assert.match(prompt.basePrompt, /warm editorial illustration, soft daylight, no text, square 1:1/);
  assert.doesNotMatch(prompt.basePrompt, /old preset style prompt/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 공통 스타일:/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 공통 색감\/톤:/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 일관성 규칙:/);
  assert.match(prompt.basePrompt, /작업 캐릭터 설정:/);
  assert.match(prompt.basePrompt, /금지 요소:/);
  assert.match(prompt.basePrompt, /Output requirements:/);
});

test("buildStudioManualImagePrompt avoids mascot fallback for story narration slides when style-only mode is preferred", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "지금 생각하면 초등학생인가 싶은데 그때는 그게 좋았음",
      text: "둘 사이의 분위기를 회상하는 설명 장면이다.",
      lines: ["둘 사이의 분위기를 회상한다."],
    }),
    slideIndex: 7,
    totalSlides: 16,
    publishCategory: "story",
    metadata: {
      mascotStyle: "soft shoujo manga inspired romance illustration style",
      mascotTone: "gentle pastel tones, airy bright mood",
    },
    availableCharacterIds: ["male_1", "female_1"],
    imageStylePrompt:
      "soft shoujo manga inspired romance illustration style, delicate sparkly eyes, gentle pastel tones, airy bright mood, soft glowing highlights, sweet and innocent romantic atmosphere, graceful clean lines, light blush, dreamy soft-focus feeling, visually tender and heartwarming, charming romantic composition, no text, no watermark",
    preferStyleOnlyBasePrompt: true,
    projectSeed: "story-style-only",
  });

  assert.doesNotMatch(prompt.basePrompt, /마스코트 이름\/정체성/);
  assert.doesNotMatch(prompt.basePrompt, /same mascot identity/);
  assert.match(prompt.basePrompt, /soft shoujo manga inspired romance illustration style/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 공통 스타일:/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 공통 색감\/톤:/);
  assert.doesNotMatch(prompt.basePrompt, /프로젝트 연출 규칙:/);
  assert.match(prompt.basePrompt, /\[male_1\]/);
  assert.match(prompt.basePrompt, /\[female_1\]/);
  assert.match(prompt.basePrompt, /금지 요소:/);
  assert.match(prompt.basePrompt, /Output requirements:/);
  assert.match(prompt.scenePrompt, /do not introduce a channel mascot identity/);
});

test("buildStudioManualImagePrompt keeps mascot route when no speakers are assigned", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "도입",
      text: "대학 도서관에서 과제를 하는 장면이다.",
      lines: ["대학 도서관에서", "과제를 하는 장면이다."],
      dialogueSegments: [],
    }),
    slideIndex: 0,
    totalSlides: 16,
    publishCategory: "story",
    metadata: {
      mascotName: "썰쇼츠 마스코트",
      mascotDescription: "친근한 단일 마스코트 캐릭터",
      mascotStyle: "깔끔한 디지털 일러스트",
      mascotTone: "밝은 라이트 톤",
    },
    imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
    preferStyleOnlyBasePrompt: false,
    projectSeed: "no-speaker-mascot-route",
  });

  assert.match(prompt.basePrompt, /마스코트 이름\/정체성: 썰쇼츠 마스코트/);
  assert.match(prompt.basePrompt, /same mascot identity/);
  assert.doesNotMatch(prompt.basePrompt, /채널 마스코트 identity는 넣지 않는다/);
});

test("buildStudioManualImagePrompt uses planner-selected scene character ids for narration slides", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "도서관 첫 장면",
      text: "내가 늘 같은 자리에 앉아 과제에 집중하던 장면이다.",
      lines: ["내가 늘 같은 자리에", "앉아 과제에 집중한다."],
      dialogueSegments: [],
    }),
    slideIndex: 0,
    totalSlides: 16,
    publishCategory: "story",
    availableCharacterIds: ["male_1", "female_1"],
    sceneCharacterIds: ["male_1"],
    imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
    preferStyleOnlyBasePrompt: true,
    projectSeed: "scene-character-override",
  });

  assert.deepEqual(prompt.characterIds, ["male_1"]);
  assert.match(prompt.basePrompt, /이번 장면 주연 후보: .*남자/);
  assert.match(prompt.scenePrompt, /등장 캐릭터:/);
});

test("buildStudioManualImagePrompt prefixes selected character names when Codex scene text stays generic", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "도서관 첫 장면",
      text: "내가 늘 같은 자리에서 과제를 하던 장면이다.",
      lines: ["내가 늘 같은 자리에서", "과제를 하던 장면이다."],
      dialogueSegments: [],
    }),
    slideIndex: 0,
    totalSlides: 16,
    publishCategory: "story",
    characterProfiles: [
      {
        characterId: "male_1",
        displayName: "남자 주인공",
        identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 후드티",
      },
    ],
    availableCharacterIds: ["male_1"],
    sceneCharacterIds: ["male_1"],
    scenePromptOverride: "대학 도서관의 늘 같은 창가 책상에서 익명의 학생이 과제에 몰두해 앉아 있다.",
    imageStylePrompt: "soft shoujo manga inspired romance illustration style, gentle pastel tones, no text",
    preferStyleOnlyBasePrompt: true,
    projectSeed: "generic-scene-text",
  });

  assert.match(prompt.scenePrompt, /^등장 캐릭터: 남자 주인공\./);
  assert.match(prompt.scenePrompt, /익명의 학생이 과제에 몰두해 앉아 있다/);
});

test("buildStudioManualImagePrompt does not attach unrelated anchors when explicit scene characters lack anchors", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "남자 주인공 독백",
      text: "남자 주인공이 도서관 창가에서 생각에 잠긴다.",
      lines: ["남자 주인공이", "생각에 잠긴다."],
      characterIds: ["male_1"],
    }),
    slideIndex: 3,
    totalSlides: 16,
    publishCategory: "story",
    metadata: {
      mascotAnchorImageUrl: "https://assets.example.com/channel-mascot.png",
      mascotAnchorAssetId: "asset_channel_mascot",
    },
    characterProfiles: [
      {
        characterId: "male_1",
        displayName: "남자 주인공",
        identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 후드티",
      },
      {
        characterId: "female_1",
        displayName: "여자 주인공",
        identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건",
        anchorImageUrl: "https://assets.example.com/female-anchor.png",
        anchorAssetId: "asset_female_anchor",
      },
    ],
    availableCharacterIds: ["male_1", "female_1"],
    imageStylePrompt: "soft romance illustration, no text",
    preferStyleOnlyBasePrompt: true,
    projectSeed: "explicit-anchor-guard",
  });

  assert.deepEqual(prompt.characterIds, ["male_1"]);
  assert.equal(prompt.anchorImageUrl, undefined);
  assert.equal(prompt.anchorAssetId, undefined);
});

test("buildStudioManualImagePrompt keeps available-character anchor fallback when no scene character is selected", () => {
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "회상 몽타주",
      text: "두 사람의 관계를 분위기로만 보여준다.",
      lines: ["두 사람의 관계를", "분위기로만 보여준다."],
      dialogueSegments: [],
    }),
    slideIndex: 6,
    totalSlides: 16,
    publishCategory: "story",
    characterProfiles: [
      {
        characterId: "male_1",
        displayName: "남자 주인공",
        identityPrompt: "20대 남자 대학생, 검은 짧은 머리, 후드티",
        anchorImageUrl: "https://assets.example.com/male-anchor.png",
      },
      {
        characterId: "female_1",
        displayName: "여자 주인공",
        identityPrompt: "20대 여자 대학생, 긴 생머리, 베이지 가디건",
      },
    ],
    availableCharacterIds: ["male_1", "female_1"],
    imageStylePrompt: "soft romance illustration, no text",
    preferStyleOnlyBasePrompt: true,
    projectSeed: "available-anchor-fallback",
  });

  assert.equal(prompt.characterIds, undefined);
  assert.equal(prompt.anchorImageUrl, "https://assets.example.com/male-anchor.png");
});

test("buildStudioManualImagePrompt removes credentials and query secrets from prompt text while retaining the fetch URL", () => {
  const signedAnchorUrl = "https://user:secret@assets.example.com/anchor.png?token=signed-value#preview";
  const prompt = buildStudioManualImagePrompt({
    slide: makeSlide({
      title: "기준 이미지 장면",
      text: "주인공이 등장한다.",
      lines: ["주인공이 등장한다."],
      characterIds: ["lead"],
    }),
    slideIndex: 0,
    totalSlides: 1,
    publishCategory: "story",
    characterProfiles: [
      {
        characterId: "lead",
        displayName: "주인공",
        identityPrompt: "검은 짧은 머리와 네이비 재킷",
        anchorImageUrl: signedAnchorUrl,
        anchorAssetId: "anchor-asset-1",
      },
    ],
    availableCharacterIds: ["lead"],
    sceneCharacterIds: ["lead"],
    projectSeed: "signed-anchor-redaction",
  });

  assert.equal(prompt.anchorImageUrl, signedAnchorUrl);
  assert.match(prompt.basePrompt, /https:\/\/assets\.example\.com\/anchor\.png/);
  assert.doesNotMatch(prompt.basePrompt, /user:secret|token=signed-value|#preview/);
  assert.doesNotMatch(prompt.finalPrompt, /user:secret|token=signed-value|#preview/);
});

test("resolveManualImagePromptCharacterIds infers speaker ids from quote segments", () => {
  assert.deepEqual(
    resolveManualImagePromptCharacterIds({
      characterIds: undefined,
      dialogueSegments: [
        { type: "narration", text: "설명" },
        { type: "quote", speakerId: "male_1", text: "안녕" },
        { type: "quote", speakerId: "female_1", text: "안녕하세요" },
        { type: "quote", speakerId: "male_1", text: "다시 말함" },
      ],
    }),
    ["male_1", "female_1"]
  );
});

test("buildStudioManualMascotBasePrompt prefers a saved full mascot prompt verbatim", () => {
  const basePrompt = buildStudioManualMascotBasePrompt({
    publishCategory: "default",
    metadata: {
      mascotPrompt:
        "파란 수트와 둥근 안경을 쓴 단일 여우 마스코트, same mascot identity, clean editorial illustration, no text, square 1:1.",
    },
  });

  assert.equal(
    basePrompt,
    "파란 수트와 둥근 안경을 쓴 단일 여우 마스코트, same mascot identity, clean editorial illustration, no text, square 1:1."
  );
});
