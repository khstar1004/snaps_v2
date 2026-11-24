import path from 'path';
import { promises as fs } from 'fs';
import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import {
  SnapsCardNewsService,
} from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { SnapsCardNewsRendererService } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-renderer.service';
import { buildSnapsCardNewsVariants } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news-variant.builder';
import { snapsPlatformRules } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';
import { snapsWeightedLength } from '@gitroom/nestjs-libraries/snaps/text/weighted-length';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';

// These scripts exist to prove the DeepSeek path was taken, so the provider a
// result reports has to be DeepSeek - not merely "not the rule fallback". The
// assertions used to read `=== 'ollama'` because every service reported that
// literal whichever engine answered; they report the real engine now.
const EXPECTED_PROVIDER = 'deepseek';

const SLIDE_COUNT = 6;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * SnapsCardNewsService.script() swallows LLM failures and returns the
 * deterministic fallback deck instead, so "it produced a deck" is not evidence
 * that DeepSeek worked. The fallback is recognisable: its body slides are
 * headed "포인트 N" and it closes with a fixed CTA heading.
 */
function looksLikeFallbackDeck(deck: {
  provider?: string;
  slides: Array<{ heading: string }>;
}) {
  // The deck now says which path built it, so this no longer has to guess. The
  // heading check stays as a second opinion: if the label ever drifts from what
  // was actually produced, the two disagree and the smoke fails loudly.
  if (deck.provider === 'rule-fallback') {
    return true;
  }
  return deck.slides.some((slide) => /^포인트 \d+$/.test(slide.heading.trim()));
}

/**
 * One malformed model response should not red this script - the service is
 * designed to degrade - but every attempt falling back means the integration
 * is genuinely broken.
 */
async function scriptWithRetry<T extends { slides: Array<{ heading: string }> }>(
  label: string,
  attempt: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let last!: T;
  for (let index = 1; index <= attempts; index += 1) {
    last = await attempt();
    if (!looksLikeFallbackDeck(last)) {
      return last;
    }
    console.log(`[cardnews-live] ${label}: fell back on attempt ${index}/${attempts}, retrying`);
  }
  return last;
}

let completed = false;
let failed = false;

async function main() {
  const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
  console.log(`[cardnews-live] AI_PROVIDER=${provider}`);
  if (provider !== 'deepseek') {
    throw new Error('Set AI_PROVIDER=deepseek before running this script.');
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not set.');
  }
  // Every other live-effect smoke in this repo demands an explicit
  // confirmation env before it does something with a real-world cost - see
  // SNAPS_RUNTIME_CONFIRM and SNAPS_NAVER_CAFE_CONFIRM in
  // verify-snaps-final-guards.ps1. This script spends DeepSeek API credits on
  // every run, so it has to ask too: having the key in .env was enough to
  // start billing.
  if (process.env.SNAPS_DEEPSEEK_CONFIRM !== 'live') {
    throw new Error(
      'Refusing to call the DeepSeek API. Set SNAPS_DEEPSEEK_CONFIRM=live to run the live smoke.'
    );
  }

  const ollama = new OllamaClient();
  console.log('[cardnews-live] resolved model:', ollama.model);

  const cardNews = new SnapsCardNewsService(ollama);
  const renderer = new SnapsCardNewsRendererService();

  for (const templateId of ['editorial', 'bold', 'minimal'] as const) {
    console.log(`\n=== template: ${templateId} ===`);
    const deck = await scriptWithRetry(`template ${templateId}`, () =>
      cardNews.script({
        sourceText:
          '가을철 환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 50% 이상으로 유지하고, 외출 후 손을 꼼꼼히 씻고, 하루 7시간 이상 충분히 자는 것이 감기 예방에 가장 효과적입니다. 비타민C가 풍부한 제철 과일을 챙겨 먹는 것도 도움이 됩니다.',
        slideCount: SLIDE_COUNT,
        tone: '친근하고 신뢰감 있는 정보 전달',
        templateId,
        brandColor: '#2563EB',
      })
    );

    console.log('title:', deck.title);
    console.log('slides:', deck.slides.length);
    deck.slides.forEach((slide) => {
      console.log(`  [${slide.eyebrow}] ${slide.heading} — ${slide.body}`);
    });
    console.log('caption:', deck.caption);
    console.log('hashtags:', deck.hashtags.join(' '));

    // Assert the label itself, not just the heuristic: if the field ever went
    // missing, looksLikeFallbackDeck() would fall through to the heading check
    // and a deck carrying no provider at all would still pass.
    assert(
      deck.provider === EXPECTED_PROVIDER,
      `${templateId}: deck reported provider=${String(deck.provider)}, expected a DeepSeek-built deck`
    );
    assert(
      !looksLikeFallbackDeck(deck),
      `${templateId}: the deck claims provider=${EXPECTED_PROVIDER} but its headings are the deterministic ones`
    );
    assert(
      deck.slides.length === SLIDE_COUNT,
      `${templateId}: expected ${SLIDE_COUNT} slides, got ${deck.slides.length}`
    );
    assert(deck.templateId === templateId, `${templateId}: templateId was not preserved`);
    assert(
      deck.slides.every((slide) => slide.heading.trim() && slide.body.trim()),
      `${templateId}: a slide came back with an empty heading or body`
    );
    assert(deck.hashtags.length > 0, `${templateId}: deck has no hashtags`);

    const rendered = await renderer.renderDeck(deck);
    const outDir = path.join(process.cwd(), 'tmp', 'cardnews-deepseek-smoke', templateId);
    await fs.mkdir(outDir, { recursive: true });
    for (const slide of rendered) {
      await fs.writeFile(path.join(outDir, slide.filename), slide.buffer);
    }
    console.log(`rendered ${rendered.length} PNG slide(s) -> ${outDir}`);
    assert(
      rendered.length === deck.slides.length,
      `${templateId}: rendered ${rendered.length} images for ${deck.slides.length} slides`
    );
    assert(
      rendered.every((slide) => slide.buffer.subarray(1, 4).toString('ascii') === 'PNG'),
      `${templateId}: a rendered slide is not a valid PNG`
    );

    const variants = buildSnapsCardNewsVariants({
      title: deck.title,
      caption: deck.caption,
      hashtags: deck.hashtags,
      slides: rendered.map((slide) => ({
        id: slide.filename,
        path: `local://${slide.filename}`,
        alt: deck.title,
      })),
    });
    console.log('variant platforms:', variants.targetPlatforms.join(', '));

    // Captions, hashtags and attachments are all clamped per platform. The
    // attachment clamp was the last one added, so exercise it on the real
    // deck: a six-slide deck is more than X accepts.
    for (const variant of variants.variants) {
      const rule = snapsPlatformRules[variant.platform];
      // In whatever the platform counts. X counts units - Hangul weighs two -
      // so comparing characters against 280 passes on a 140 character Korean
      // caption whether or not the weighted clamp still works, and the one
      // thing this smoke exists to catch would go unnoticed.
      const captionBudget = rule.weightedLimit ?? rule.maxLength;
      const captionSize = rule.weightedLimit
        ? snapsWeightedLength(variant.content)
        : variant.content.length;
      assert(
        captionSize <= captionBudget,
        `${templateId}: ${variant.platform} caption is ${captionSize}${
          rule.weightedLimit ? ' units' : ' characters'
        }, over ${captionBudget}`
      );
      assert(
        variant.hashtags.length <= (rule.hashtagLimit ?? 20),
        `${templateId}: ${variant.platform} has ${variant.hashtags.length} hashtags, over its limit`
      );
      if (rule.mediaLimit) {
        assert(
          variant.media.length <= rule.mediaLimit,
          `${templateId}: ${variant.platform} carries ${variant.media.length} attachments, over ${rule.mediaLimit}`
        );
      }
    }
    const clampedX = variants.variants.find((variant) => variant.platform === 'x');
    assert(
      !!clampedX && clampedX.media.length === snapsPlatformRules.x.mediaLimit,
      `${templateId}: X should have been trimmed to ${snapsPlatformRules.x.mediaLimit} attachments`
    );
    // The clamps above prove the variants are shaped correctly; this proves the
    // posts built from them are. A real deck carries long Korean captions and
    // model-written hashtags, which is where the caption budget and the hashtag
    // attach interact - the synthetic offline fixtures cannot reproduce that.
    const schedulable = variants.variants.filter(
      (variant) => variant.publishMode === 'schedule'
    );
    const scheduled = buildSnapsPublishingPayload({
      variants: schedulable,
      integrations: schedulable.map((variant) => ({
        platform: variant.platform,
        integrationId: `live-${variant.platform}`,
      })),
      publishDate: new Date(Date.now() + 3600_000).toISOString(),
      scheduleType: 'schedule',
    } as never);

    // A variant may legitimately be skipped - Naver Cafe needs a clubId and a
    // menuId the card news flow does not have - but only if the builder says so.
    // Posts plus reported skips must account for every schedulable variant, so a
    // silent drop still fails here.
    const prepared = scheduled.schedulable.map((variant) => variant.platform);
    const skipped = schedulable
      .map((variant) => variant.platform)
      .filter((platform) => !prepared.includes(platform));
    assert(
      scheduled.payload?.posts?.length === prepared.length,
      `${templateId}: prepared ${prepared.length} variants but built ${
        scheduled.payload?.posts?.length ?? 0
      } posts`
    );
    for (const platform of skipped) {
      assert(
        scheduled.warnings.some(
          (warning) =>
            warning.includes(platform) ||
            warning.includes(snapsPlatformRules[platform].label)
        ),
        `${templateId}: ${platform} was dropped from the schedule with no warning explaining why`
      );
    }
    scheduled.schedulable.forEach((variant, index) => {
      const rule = snapsPlatformRules[variant.platform];
      const post = scheduled.payload.posts[index];
      const published = (post.value as Array<{ content: string; image: unknown[] }>)
        .map((segment) => segment.content)
        .join('\n');

      const postBudget = rule.weightedLimit ?? rule.maxLength;
      const postSize = rule.weightedLimit
        ? snapsWeightedLength(published)
        : published.length;
      assert(
        postSize <= postBudget,
        `${templateId}: the ${variant.platform} post is ${postSize}${
          rule.weightedLimit ? ' units' : ' characters'
        }, over its ${postBudget} limit`
      );
      const publishedTags = published.split(/\s+/).filter((token) => token.startsWith('#'));
      assert(
        publishedTags.length <= (rule.hashtagLimit ?? 20),
        `${templateId}: the ${variant.platform} post carries ${publishedTags.length} hashtags, over its limit`
      );
      const attached = (post.value as Array<{ image: unknown[] }>)[0]?.image ?? [];
      assert(
        !rule.mediaLimit || attached.length <= rule.mediaLimit,
        `${templateId}: the ${variant.platform} post carries ${attached.length} attachments, over ${rule.mediaLimit}`
      );
    });
    const withTags = scheduled.schedulable.filter(
      (variant) => variant.hashtags.length > 0
    );
    assert(
      withTags.length > 0,
      `${templateId}: no variant carried hashtags, so the attach step proved nothing`
    );
    console.log(
      // The variant line above lists every platform, most of which are
      // copy-only. Printing the post count against it alone reads as a
      // silent drop - it misread that way once. Name the denominator.
      `published posts ok: ${scheduled.payload.posts.length}/${schedulable.length} ` +
        `schedulable variant(s) (${variants.variants.length - schedulable.length} copy-only) ` +
        `within every caption, hashtag and attachment limit` +
        (skipped.length ? `; ${skipped.join(', ')} skipped with a warning` : '')
    );

    console.log(
      'per-platform clamps ok; x attachments:',
      `${clampedX.media.length}/${rendered.length}`,
      variants.warnings.length ? `(warned: ${variants.warnings.length})` : ''
    );
  }

  completed = true;
  process.exitCode = 0;
  console.log('\n[cardnews-live] ALL TEMPLATES COMPLETED OK');
}

// Failing by default, cleared only when main() reaches its end.
//
// A promise that never settles does not hold the Node event loop open, so an
// await that hangs does not fail this script - it ends it, with every check
// after that point skipped and an exit code of 0. Measured on the controller
// smoke: deleting the analytics timeout stopped the run at that check and it
// still reported success.
process.exitCode = 1;

main().catch((error) => {
  failed = true;
  console.error('[cardnews-live] FAILED:', error);
  process.exitCode = 1;
});

process.on('exit', () => {
  if (failed) {
    return;
  }
  if (completed) {
    // `completed` is the invariant; the exit code is only a copy of it.
    // Two dry-run paths set the flag and returned without clearing the
    // fail-by-default code above, so they printed their own -ok line and
    // still exited 1 - which took the whole preflight down with them.
    process.exitCode = 0;
    return;
  }
  // Reported rather than just failed: without this line the run above
  // produced no output at all, only a non-zero code, and the check it
  // stopped on was invisible.
  console.error(
    'verify-snaps-cardnews-deepseek did not finish: a check stopped without',
    'settling, so everything after it was skipped'
  );
  process.exitCode = 1;
});
