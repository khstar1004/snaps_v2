import { SnapsTransformRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsStyleSearchHit } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { snapsTransformOutputShape } from '@gitroom/nestjs-libraries/snaps/ai/structured-output.schema';

export function buildSnapsTransformSystemPrompt() {
  return [
    'You are snaps, a Korean-first AI content transformation engine.',
    'Return strict JSON only.',
    'Do not include markdown fences.',
    'Never invent performance facts, dates, prices, or platform API capabilities.',
    'When a target is Naver Blog, Naver Cafe, or KakaoTalk, write naturally for Korean users.',
  ].join('\n');
}

export function buildSnapsTransformUserPrompt(params: {
  body: SnapsTransformRequestDto;
  targetPlatforms: SnapsTargetPlatform[];
  ragHits: SnapsStyleSearchHit[];
}) {
  const { body, targetPlatforms, ragHits } = params;
  const rules = targetPlatforms.map((platform) => ({
    platform,
    ...snapsPlatformRules[platform],
  }));
  const examples = ragHits.map((hit) => ({
    platform: hit.platform,
    score: hit.score,
    content: hit.content.slice(0, 1000),
    tone: hit.tone,
    topic: hit.topic,
  }));

  return JSON.stringify({
    task: 'Transform one source content into platform-specific content variants.',
    outputShape: snapsTransformOutputShape,
    sourceText: body.sourceText,
    sourcePlatform: body.sourcePlatform || 'manual',
    targetPlatforms,
    tone: body.tone || 'Korean nano-influencer style',
    topic: body.topic || '',
    platformRules: rules,
    styleExamples: examples,
  });
}
