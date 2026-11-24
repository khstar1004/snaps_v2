import { SnapsTransformRequestDto } from '@gitroom/nestjs-libraries/snaps/dto/transform-request.dto';
import {
  SnapsTargetPlatform,
  snapsPlatformRules,
} from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { SnapsStyleSearchHit } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { snapsTransformOutputShape } from '@gitroom/nestjs-libraries/snaps/ai/structured-output.schema';
import { snapsClampText } from '@gitroom/nestjs-libraries/snaps/text/clamp-text';

export function buildSnapsTransformSystemPrompt() {
  return [
    'You are snaps, a Korean-first AI content transformation engine.',
    'Return strict JSON only.',
    'Do not include markdown fences.',
    'Never invent performance facts, dates, prices, or platform API capabilities.',
    'Use the provided platformRules as the source of truth for channel constraints, culture, structure, and hashtag density.',
    'styleExamples are ordered best-first; an example matchedBy "embedding" is a closer match than one matchedBy "keyword".',
    'Keep platform culture general and durable; avoid forced slang, stereotypes, or overly niche memes.',
    'For platforms with postMaxLength, write the content as multiple publishable segments separated by blank lines when needed.',
    'When a target is Naver Blog, Naver Cafe, KakaoTalk, or Xiaohongshu, write naturally for the channel and avoid unsupported publishing claims.',
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
  // `score` used to travel to the model as a bare number. It is not one scale:
  // an example the query embedding could be compared against is scored by
  // cosine, one that could not - because the embed call failed when it was
  // saved, or it came from a different embed model - falls back to token
  // overlap, and that reaches exactly 1.0 whenever every query word appears.
  // A model weighting by that number would put a keyword match above the
  // closest semantic one, which is the inversion the vector store was fixed to
  // stop. The basis is what is worth telling it, so say that instead.
  const examples = ragHits.map((hit) => ({
    platform: hit.platform,
    // The store reports the branch it took. `hit.embedding` is only half of
    // it and told the model 'embedding' for hits that were token-scored.
    matchedBy: hit.matchedBy,
    content: snapsClampText(hit.content, 1000),
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
