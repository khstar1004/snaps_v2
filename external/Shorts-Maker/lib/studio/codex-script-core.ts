import { convertScriptToStudioJsonWithTransport, generateScriptFromTopicWithTransport, normalizeGeneratedScript } from "@/lib/studio/codex-script-core-runner";
import { CodexPipelineError } from "@/lib/studio/codex-script-core-errors";
import {
  describeCaptionLayoutBudget,
  LEGACY_CAPTION_LAYOUT_POLICY,
  type CaptionLayoutPolicy,
} from "@/lib/studio/caption-layout";
import type { CodexPromptOverrides, DialogueMode } from "@/lib/studio/codex-script-to-json";
import type { CodexUsage } from "@/lib/studio/codex-script-transport";
import * as codexScriptToJson from "@/lib/studio/codex-script-to-json";
import {
  buildTopicScriptRepairUserPrompt,
  buildTopicScriptSystemPrompt,
  buildTopicScriptUserPrompt,
  validateTopicScriptDraft,
  toScriptStructure,
} from "@/lib/studio/codex-topic-script";
import type { PublishCategory, StudioPrepareRequest } from "@/types/studio-json";

type CodexConvertResult = {
  payload: StudioPrepareRequest;
  usage?: CodexUsage;
  title?: string;
};

type CodexScriptResult = {
  script: string;
  usage?: CodexUsage;
};

export { CodexPipelineError, isCodexPipelineError } from "@/lib/studio/codex-script-core-errors";
export type { CodexPipelineErrorCode } from "@/lib/studio/codex-script-core-errors";

export async function generateScriptFromTopic(
  topic: string,
  codexAccessToken?: string,
  codexModel?: string,
  publishCategory?: PublishCategory,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal"
): Promise<CodexScriptResult> {
  const safeTopic = topic.trim();
  if (!safeTopic) {
    throw new CodexPipelineError("topic must not be empty", {
      code: "TOPIC_TO_SCRIPT_INPUT_INVALID",
      retryable: false,
      status: 400,
    });
  }
  return generateScriptFromTopicWithTransport(safeTopic, codexAccessToken, codexModel, publishCategory, promptTemplates, mode);
}

export async function convertScriptToStudioJson(
  script: string,
  publishCategory?: PublishCategory,
  codexAccessToken?: string,
  codexModel?: string,
  promptTemplates?: CodexPromptOverrides,
  mode: DialogueMode = "normal",
  captionLayoutPolicy: CaptionLayoutPolicy = LEGACY_CAPTION_LAYOUT_POLICY,
): Promise<CodexConvertResult> {
  const safeScript = script.trim();
  if (!safeScript) {
    throw new CodexPipelineError("script must not be empty", {
      code: "SCRIPT_TO_JSON_INPUT_INVALID",
      retryable: false,
      status: 400,
    });
  }

  const source = toScriptStructure(safeScript);
  if (!source.title) {
    throw new CodexPipelineError("script-to-json 변환에는 비어 있지 않은 첫 줄 hook/title이 필요합니다.", {
      code: "SCRIPT_TO_JSON_INPUT_INVALID",
      retryable: false,
      status: 400,
    });
  }
  if (source.bodyLines.length <= 0) {
    throw new CodexPipelineError("script-to-json 변환에는 title 아래에 body 또는 CTA 줄이 최소 1개 이상 필요합니다.", {
      code: "SCRIPT_TO_JSON_INPUT_INVALID",
      retryable: false,
      status: 400,
    });
  }
  const overlongToken = codexScriptToJson.findOverlongScriptBodyToken(source.bodyText, captionLayoutPolicy);
  if (overlongToken) {
    throw new CodexPipelineError(
      `본문의 "${overlongToken.token}" 어절이 ${describeCaptionLayoutBudget(captionLayoutPolicy)}을 넘습니다. 원문을 바꾸지 않고 나눌 수 있도록 공백을 확인해 주세요.`,
      {
        code: "SCRIPT_TO_JSON_INPUT_INVALID",
        retryable: false,
        status: 400,
      }
    );
  }
  if (codexScriptToJson.toScriptBodyTokens(source.bodyText).length < 2) {
    throw new CodexPipelineError("본문은 2줄 이상으로 나눌 수 있도록 공백으로 구분된 어절이 최소 2개 필요합니다.", {
      code: "SCRIPT_TO_JSON_INPUT_INVALID",
      retryable: false,
      status: 400,
    });
  }

  return convertScriptToStudioJsonWithTransport(
    safeScript,
    publishCategory,
    codexAccessToken,
    codexModel,
    promptTemplates,
    mode,
    captionLayoutPolicy,
  );
}

export const __internal = {
  normalizeGeneratedScript,
  toScriptStructure,
  validateTopicScriptDraft,
  parseScriptToJsonResult: codexScriptToJson.parseScriptToJsonResult,
  buildTopicScriptSystemPrompt,
  buildTopicScriptUserPrompt,
  buildTopicScriptRepairUserPrompt,
  buildScriptToJsonSystemPrompt: codexScriptToJson.buildScriptToJsonSystemPrompt,
  buildScriptToJsonUserPrompt: codexScriptToJson.buildScriptToJsonUserPrompt,
  buildScriptToJsonRepairUserPrompt: codexScriptToJson.buildScriptToJsonRepairUserPrompt,
};
