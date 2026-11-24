import {
  resolveStudioVoiceSelection,
  type ResolvedStudioVoiceSelection,
  type StudioVoiceSelectionOverrides,
} from "@/lib/studio/tts-config";
import {
  concatWavBase64Segments,
  estimateDurationsFromWavBase64Segments,
  estimateWavDurationSecFromBase64,
} from "@/lib/studio/wav-audio";
import {
  synthesizeTypecastSpeech,
  synthesizeTypecastSpeechSegments,
  type TypecastSpeechResult,
} from "@/lib/studio/tts-typecast";
import {
  prepareStudioTtsText,
  remapStudioTtsAlignmentToSource,
  STUDIO_TTS_TEXT_NORMALIZATION_VERSION,
  type StudioTtsTextNormalization,
} from "@/lib/studio/tts-text";

export type StudioAlignmentWord = {
  word: string;
  startSec: number;
  endSec: number;
  charStart?: number;
  charEnd?: number;
};

export type StudioSynthesizedSpeech = {
  audioBase64: string;
  durationSec: number;
  mimeType: "audio/wav";
  format: "wav";
  provider: "typecast";
  supportsAlignment: boolean;
  words: StudioAlignmentWord[];
  characterStartTimesSec: number[];
  characterEndTimesSec: number[];
  resolvedVoice: ResolvedStudioVoiceSelection;
};

export type StudioSynthesizedSegment = {
  audioBase64: string;
  durationSec: number;
  mimeType: "audio/wav";
  format: "wav";
  provider: "typecast";
  resolvedVoice: ResolvedStudioVoiceSelection;
};

export type StudioSpeechCacheContext = {
  provider: "typecast";
  voiceId: string;
  modelId: string;
  variant: string;
};

function mapTypecastResult(
  result: TypecastSpeechResult,
  selection: ResolvedStudioVoiceSelection,
  normalization: StudioTtsTextNormalization
): StudioSynthesizedSpeech {
  const alignment = remapStudioTtsAlignmentToSource(normalization, {
    words: result.words,
    characterStartTimesSec: result.characterStartTimesSec,
    characterEndTimesSec: result.characterEndTimesSec,
  });
  const supportsAlignment =
    alignment.words.length > 0 ||
    alignment.characterStartTimesSec.some((value) => Number.isFinite(value)) ||
    alignment.characterEndTimesSec.some((value) => Number.isFinite(value));
  return {
    audioBase64: result.audioBase64,
    durationSec: result.durationSec,
    mimeType: result.mimeType,
    format: result.format,
    provider: "typecast",
    supportsAlignment,
    words: alignment.words,
    characterStartTimesSec: alignment.characterStartTimesSec,
    characterEndTimesSec: alignment.characterEndTimesSec,
    resolvedVoice: selection,
  };
}

export function buildStudioSpeechCacheContext(selection: ResolvedStudioVoiceSelection): StudioSpeechCacheContext {
  const modelId = selection.typecast?.modelId || selection.settings.typecast.modelId;
  const voiceId = selection.typecast?.voiceId || selection.settings.typecast.defaultVoiceId || selection.id;
  return {
    provider: "typecast",
    voiceId,
    modelId,
    variant: JSON.stringify({
      alignmentVersion: "typecast-timestamps-v1",
      speed: selection.settings.typecast.speed,
      language: selection.typecast?.language || selection.settings.typecast.defaultLanguage,
      emotionType: selection.typecast?.emotionType || selection.settings.typecast.defaultEmotionType,
      textNormalizationVersion: STUDIO_TTS_TEXT_NORMALIZATION_VERSION,
    }),
  };
}

export async function synthesizeStudioSpeechFromSelection(
  selection: ResolvedStudioVoiceSelection,
  text: string
): Promise<StudioSynthesizedSpeech> {
  const normalization = prepareStudioTtsText(text);
  return mapTypecastResult(
    await synthesizeTypecastSpeech(
      {
        apiKey: selection.settings.typecast.apiKey,
      },
      {
        text: normalization.text,
        voiceId: selection.typecast?.voiceId || selection.settings.typecast.defaultVoiceId,
        model: selection.typecast?.modelId || selection.settings.typecast.modelId,
        language: selection.typecast?.language || selection.settings.typecast.defaultLanguage,
        emotionType: selection.typecast?.emotionType || selection.settings.typecast.defaultEmotionType,
        speed: selection.settings.typecast.speed,
      }
    ),
    selection,
    normalization
  );
}

export async function synthesizeStudioSpeech(
  text: string,
  voiceId?: string,
  overrides?: StudioVoiceSelectionOverrides
): Promise<StudioSynthesizedSpeech> {
  const selection = await resolveStudioVoiceSelection(voiceId, {
    typecastEmotionType: overrides?.typecastEmotionType,
    typecastSpeed: overrides?.typecastSpeed,
  });
  return synthesizeStudioSpeechFromSelection(selection, text);
}

export async function synthesizeStudioSpeechSegments(
  segments: string[],
  voiceId?: string,
  overrides?: StudioVoiceSelectionOverrides
): Promise<StudioSynthesizedSegment[]> {
  const selection = await resolveStudioVoiceSelection(voiceId, {
    typecastEmotionType: overrides?.typecastEmotionType,
    typecastSpeed: overrides?.typecastSpeed,
  });
  const results = await synthesizeTypecastSpeechSegments(
    {
      apiKey: selection.settings.typecast.apiKey,
    },
    {
      segments: segments.map((segment) => prepareStudioTtsText(segment).text),
      voiceId: selection.typecast?.voiceId || selection.settings.typecast.defaultVoiceId,
      model: selection.typecast?.modelId || selection.settings.typecast.modelId,
      language: selection.typecast?.language || selection.settings.typecast.defaultLanguage,
      emotionType: selection.typecast?.emotionType || selection.settings.typecast.defaultEmotionType,
      speed: selection.settings.typecast.speed,
    }
  );
  return results.map((result) => ({
    audioBase64: result.audioBase64,
    durationSec: result.durationSec,
    mimeType: result.mimeType,
    format: result.format,
    provider: "typecast",
    resolvedVoice: selection,
  }));
}

export function concatStudioAudioSegments(segments: StudioSynthesizedSegment[]): {
  audioBase64: string;
  mimeType: "audio/wav";
  format: "wav";
} {
  if (segments.length <= 0) {
    return {
      audioBase64: "",
      mimeType: "audio/wav",
      format: "wav",
    };
  }
  return {
    audioBase64: concatWavBase64Segments(segments.map((segment) => segment.audioBase64)),
    mimeType: "audio/wav",
    format: "wav",
  };
}

export function estimateStudioAudioDurationSec(audioBase64: string, format: "wav"): number {
  return estimateWavDurationSecFromBase64(audioBase64);
}

export function estimateDurationsFromStudioAudioSegments(
  segments: Array<{ audioBase64: string; format: "wav" }>
): number[] {
  if (segments.length <= 0) return [];
  return estimateDurationsFromWavBase64Segments(segments.map((segment) => segment.audioBase64));
}
