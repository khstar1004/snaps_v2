import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsVectorStoreService } from '@gitroom/nestjs-libraries/snaps/rag/vector-store.service';
import { SnapsRagService } from '@gitroom/nestjs-libraries/snaps/rag/rag.service';
import { SnapsContentTransformService } from '@gitroom/nestjs-libraries/snaps/transform/content-transform.service';
import { SnapsReportGeneratorService } from '@gitroom/nestjs-libraries/snaps/analytics/report-generator.service';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';
import { SnapsFeedbackInboxService } from '@gitroom/nestjs-libraries/snaps/inbox/feedback-inbox.service';
import { SnapsCommandPlannerService } from '@gitroom/nestjs-libraries/snaps/agent/command-planner.service';
import { SnapsCardNewsService } from '@gitroom/nestjs-libraries/snaps/cardnews/card-news.service';
import { buildSnapsPublishingPayload } from '@gitroom/nestjs-libraries/snaps/schedule/publishing-payload.builder';
import { snapsPlatformRules } from '@gitroom/nestjs-libraries/snaps/transform/platform-rules';

// These scripts exist to prove the DeepSeek path was taken, so the provider a
// result reports has to be DeepSeek - not merely "not the rule fallback". The
// assertions used to read `=== 'ollama'` because every service reported that
// literal whichever engine answered; they report the real engine now.
const EXPECTED_PROVIDER = 'deepseek';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Live-LLM steps are retried a few times. snaps deliberately degrades to a
 * deterministic fallback when a single model response is malformed, so one
 * transient DeepSeek hiccup must not red this script - but a genuinely broken
 * integration still fails once every attempt falls back.
 */
async function withLlmRetry<T>(
  label: string,
  attempt: () => Promise<T>,
  reachedLlm: (result: T) => boolean,
  attempts = 3
): Promise<T> {
  let last!: T;
  for (let index = 1; index <= attempts; index += 1) {
    last = await attempt();
    if (reachedLlm(last)) {
      return last;
    }
    console.log(`[core-deepseek-live] ${label}: fell back on attempt ${index}/${attempts}, retrying`);
  }
  return last;
}

let completed = false;
let failed = false;

async function main() {
  const provider = (process.env.AI_PROVIDER || process.env.SNAPS_LLM_PROVIDER || 'ollama').toLowerCase();
  console.log(`[core-deepseek-live] AI_PROVIDER=${provider}`);
  if (provider !== 'deepseek') {
    throw new Error('Set AI_PROVIDER=deepseek before running this script.');
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not set.');
  }
  // Same reasoning as verify-snaps-cardnews-deepseek.ts: this is a live,
  // billed API call and every other live-effect smoke here asks first.
  if (process.env.SNAPS_DEEPSEEK_CONFIRM !== 'live') {
    throw new Error(
      'Refusing to call the DeepSeek API. Set SNAPS_DEEPSEEK_CONFIRM=live to run the live smoke.'
    );
  }

  const ollama = new OllamaClient();
  console.log('[core-deepseek-live] resolved chat model:', ollama.model);

  const health = await ollama.health();
  console.log('[core-deepseek-live] health:', JSON.stringify(health));
  assert(health.provider === 'deepseek', 'health() did not report the deepseek provider');
  assert(health.chatModelAvailable, `DeepSeek chat model unavailable: ${health.error || 'unknown reason'}`);

  const vectorStore = new SnapsVectorStoreService();
  const rag = new SnapsRagService(ollama, vectorStore);
  const transformer = new SnapsContentTransformService(ollama, rag);
  const reports = new SnapsReportGeneratorService(ollama);
  const shorts = new SnapsShortVideoService(ollama);
  const inbox = new SnapsFeedbackInboxService(ollama);

  console.log('\n=== 1) content transform (real DeepSeek call) ===');
  const transform = await withLlmRetry(
    'content transform',
    () =>
      transformer.transform('deepseek-live-org', {
        sourceText:
          '가을철 환절기에는 일교차가 커지면서 면역력이 떨어지기 쉽습니다. 실내 습도를 50% 이상으로 유지하고, 외출 후 손을 꼼꼼히 씻고, 하루 7시간 이상 충분히 자는 것이 감기 예방에 가장 효과적입니다.',
        targetPlatforms: ['instagram', 'threads'],
        tone: '친근하고 신뢰감 있는 정보 전달',
        useRag: false,
      }),
    (result) => result.provider === EXPECTED_PROVIDER
  );
  console.log('provider:', transform.provider, 'model:', transform.model);
  console.log('variants:', transform.variants.map((variant) => `${variant.platform}: ${variant.content.slice(0, 60)}...`));
  assert(
    transform.provider === EXPECTED_PROVIDER,
    `content transform should report provider=${EXPECTED_PROVIDER}, got ${transform.provider}`
  );
  assert(transform.variants.length === 2, 'content transform did not return both requested platforms');
  assert(
    transform.variants.every((variant) => variant.content && variant.content.length > 5),
    'content transform returned an empty variant body'
  );

  console.log('\n=== 1b) the model hashtags survive into the publishing payload ===');
  // buildSnapsPublishingPayload used to publish variant.content alone, so every
  // tag the model produced was shown in the workspace and never posted. Offline
  // tests missed it because the deterministic fallback writes its tags inline;
  // only a real model response, which puts them in the separate `hashtags` field
  // the output schema asks for, exercises the gap.
  const schedulable = transform.variants.map((variant) => ({
    ...variant,
    publishMode: 'schedule' as const,
  }));
  const scheduled = buildSnapsPublishingPayload({
    variants: schedulable,
    integrations: schedulable.map((variant) => ({
      platform: variant.platform,
      integrationId: `live-${variant.platform}`,
    })),
    publishDate: new Date(Date.now() + 3600_000).toISOString(),
    scheduleType: 'schedule',
  } as never);

  assert(
    scheduled.payload.posts.length === schedulable.length,
    `expected ${schedulable.length} posts, built ${scheduled.payload.posts.length}`
  );
  assert(
    schedulable.some((variant) => variant.hashtags.length > 0),
    'the live model returned no hashtags at all, so this check proved nothing'
  );
  schedulable.forEach((variant, index) => {
    const post = scheduled.payload.posts[index];
    const published = (post.value as Array<{ content: string }>)
      .map((segment) => segment.content)
      .join('\n');
    const rule = snapsPlatformRules[variant.platform];

    assert(
      published.length <= rule.maxLength,
      `${variant.platform} post is ${published.length} characters, over its ${rule.maxLength} limit`
    );

    const publishedTags = published.split(/\s+/).filter((token) => token.startsWith('#'));
    const missing = variant.hashtags.filter((tag) => !publishedTags.includes(tag));
    // Tags are only dropped when they genuinely do not fit, and that is reported.
    const reportedShort = scheduled.warnings.some((entry) =>
      entry.includes('해시태그')
    );
    assert(
      !missing.length || reportedShort,
      `${variant.platform} lost hashtags ${missing.join(' ')} with no warning explaining why`
    );
    console.log(
      `${variant.platform}: model tags ${variant.hashtags.length} -> published ${publishedTags.length}` +
        ` (${published.length}/${rule.maxLength} chars)`
    );
  });

  console.log('\n=== 2) analytics report (real DeepSeek call) ===');
  const reportRequest = {
    title: 'DeepSeek live smoke report',
    metrics: [
      { platform: 'instagram', metricKey: 'impressions', metricValue: 1200, collectedAt: '2026-09-01T00:00:00.000Z' },
      { platform: 'instagram', metricKey: 'impressions', metricValue: 1800, collectedAt: '2026-09-08T00:00:00.000Z' },
      { platform: 'instagram', metricKey: 'likes', metricValue: 64, collectedAt: '2026-09-08T00:00:00.000Z' },
    ],
  };
  const report = await withLlmRetry(
    'analytics report',
    () => reports.generate(reportRequest),
    // The report now says which path wrote the summary. The old proxy - a
    // summary differing from the insights joined by a space - stays as a cross
    // check: if the label ever disagrees with what was produced, this fails.
    (result) =>
      (result as { provider?: string }).provider === EXPECTED_PROVIDER &&
      result.summary.trim() !== result.insights.join(' ').trim()
  );
  console.log('summary:', report.summary);
  console.log('insights:', report.insights);
  assert(typeof report.summary === 'string' && report.summary.length > 5, 'report summary missing');
  assert(report.insights.length > 0, 'report insights missing');
  assert(
    (report as { provider?: string }).provider === EXPECTED_PROVIDER,
    `analytics report reported provider=${(report as { provider?: string }).provider}; the DeepSeek summary was not used`
  );
  assert(
    report.summary.trim() !== report.insights.join(' ').trim(),
    'the report claims a model summary but returned the deterministic one, so the label disagrees with the output'
  );

  console.log('\n=== 3) shorts script (real DeepSeek call) ===');
  const script = await shorts.script({
    sourceText: '신제품 무선 이어폰을 출시했습니다. 노이즈캔슬링과 30시간 배터리가 강점입니다.',
    durationSeconds: 30,
    platform: 'youtube',
  });
  console.log('title:', script.title, '| storyboard scenes:', script.storyboard.length);
  assert(script.storyboard.length >= 3, 'shorts script storyboard too short');
  assert(script.uploadMetadata.hashtags.length > 0, 'shorts script upload hashtags missing');

  // Measured against the live API, roughly one run in three read endSecond as
  // inclusive and returned 0-5 / 6-14 / 15-23, leaving a second of dead air at
  // every boundary. enforceTimeline() closes those gaps, so the live run has to
  // check the timeline it actually produced - not just the scene count.
  assert(
    script.storyboard[0].startSecond === 0,
    `shorts storyboard starts at ${script.storyboard[0].startSecond}s, not 0`
  );
  assert(
    script.storyboard[script.storyboard.length - 1].endSecond === script.durationSeconds,
    `shorts storyboard ends at ${script.storyboard[script.storyboard.length - 1].endSecond}s, not ${script.durationSeconds}s`
  );
  script.storyboard.forEach((scene, index) => {
    assert(scene.scene === index + 1, `shorts scene ${index + 1} is numbered ${scene.scene}`);
    assert(
      scene.endSecond > scene.startSecond,
      `shorts scene ${scene.scene} has a non-positive duration`
    );
    if (index > 0) {
      assert(
        scene.startSecond === script.storyboard[index - 1].endSecond,
        `shorts timeline has a gap before scene ${scene.scene}`
      );
    }
  });
  console.log(
    'timeline ok:',
    script.storyboard.map((scene) => `${scene.startSecond}-${scene.endSecond}`).join(' ')
  );

  console.log('\n=== 4) feedback summary (real DeepSeek call) ===');
  const summary = await inbox.summarize('deepseek-live-org', {
    items: [
      { platform: 'instagram', content: '이 제품 배터리는 얼마나 가나요?' },
      { platform: 'instagram', content: '디자인이 너무 예뻐요! 잘 쓰고 있습니다.' },
      { platform: 'threads', content: '배송이 너무 늦게 와서 불편했어요.' },
    ],
  });
  console.log('feedback summary:', JSON.stringify(summary.bySentiment));
  assert(summary.total === 3, 'feedback summary did not process all inline items');

  // The prompt hands the model the deterministic fallback so it has a shape to
  // copy - and it copied the answer too, echoing the single fallback reply and
  // adding nothing. The rules that fixed it ask for one reply per sentiment
  // present, so three comments spanning question/praise/complaint should come
  // back with more than one distinct target.
  assert(
    summary.replySuggestions.length > 0,
    'feedback summary returned no reply suggestions'
  );
  const replyTargets = new Set(summary.replySuggestions.map((item) => item.target));
  assert(
    replyTargets.size >= 2,
    `feedback summary produced ${replyTargets.size} distinct reply target(s); the model is echoing the fallback instead of reading the comments`
  );
  assert(
    summary.highlights.length >= 2,
    `feedback summary returned ${summary.highlights.length} highlight(s), expected the 2-4 the rules ask for`
  );
  console.log(
    'reply suggestions:',
    summary.replySuggestions.length,
    '| targets:',
    [...replyTargets].join(', '),
    '| highlights:',
    summary.highlights.length
  );

  console.log('\n=== 5) agent command planner (real DeepSeek call) ===');
  const planner = new SnapsCommandPlannerService(
    ollama,
    transformer,
    shorts,
    new SnapsCardNewsService(ollama)
  );
  const planned = await planner.prepare('deepseek-live-org', {
    command:
      '가을 환절기 감기 예방 내용을 인스타그램과 스레드에 올릴 게시글로 정리하고, 카드뉴스도 같이 만들어줘.',
    useRag: false,
  });
  console.log('plan platforms:', planned.plan.targetPlatforms.join(', '));
  console.log('includeCardNews:', planned.plan.includeCardNews);
  console.log('card news slides:', planned.cardNews?.slides.length ?? 0);
  assert(planned.plan.targetPlatforms.length > 0, 'agent planner returned no target platforms');
  assert(planned.transform.variants.length > 0, 'agent planner produced no transform variants');
  assert(
    planned.plan.includeCardNews === true,
    'agent planner did not route an explicit 카드뉴스 request to the card news pipeline'
  );
  assert(
    (planned.cardNews?.slides.length ?? 0) > 0,
    'agent planner routed to card news but produced no deck slides'
  );

  console.log('\n=== 6) transform with RAG enabled (embeddings stay on Ollama) ===');
  // DeepSeek has no embeddings endpoint, so retrieval always calls the local
  // Ollama embed model while the chat call goes to DeepSeek. That split is the
  // one thing only a live run can check.
  //
  // This section used to transform against an empty store and assert nothing
  // but that a model answered. Every other section already runs with retrieval
  // on - `useRag` only skips it when explicitly false - so it re-ran section 1
  // and reported ragExamplesUsed: 0 while reading like it had covered RAG.
  // Seed the store first, so a retrieved example has to reach the DeepSeek
  // prompt for this to pass.
  // A fixed org id made this section pass on every run after the first: the
  // seeded examples stay on disk, so removing the seeding entirely still
  // retrieved two of them. The store has to be empty at the start of each run
  // for the seeding to be what the assertion is testing.
  const ragOrg = `deepseek-live-rag-${process.pid}-${Date.now()}`;
  const seeded = [
    {
      platform: 'instagram',
      content:
        '환절기 건강 관리는 습도부터 챙기세요. 실내 습도 50%가 기준입니다. 저장해두고 하나씩 실천해 보세요.',
    },
    {
      platform: 'instagram',
      content:
        '손 씻기는 기본 중의 기본이에요. 외출 후 30초만 투자하세요. 오늘부터 함께 해봐요.',
    },
  ];
  for (const example of seeded) {
    await rag.addExample(ragOrg, example as never);
  }

  const ragTransform = await withLlmRetry(
    'RAG-enabled transform',
    () =>
      transformer.transform(ragOrg, {
        sourceText:
          '환절기 건강 관리 팁을 정리한 게시물입니다. 실내 습도와 손 씻기가 핵심입니다.',
        targetPlatforms: ['instagram'],
        useRag: true,
      }),
    (result) =>
      result.provider === EXPECTED_PROVIDER && result.ragExamplesUsed.length > 0
  );
  console.log(
    'provider:',
    ragTransform.provider,
    '| ragExamplesUsed:',
    ragTransform.ragExamplesUsed.length,
    '| seeded:',
    seeded.length
  );
  assert(
    ragTransform.variants.length === 1,
    'RAG-enabled transform did not return the requested platform variant'
  );
  assert(
    ragTransform.provider === EXPECTED_PROVIDER,
    `RAG-enabled transform fell back instead of using the LLM (provider=${ragTransform.provider})`
  );
  // The point of the section: retrieval ran against a store that had something
  // in it, and what came back was handed to the DeepSeek call.
  assert(
    ragTransform.ragExamplesUsed.length > 0,
    'RAG-enabled transform used no style example even though the store was seeded; ' +
      'retrieval is not reaching the prompt'
  );

  completed = true;
  process.exitCode = 0;
  console.log('\n[core-deepseek-live] ALL CORE SNAPS FEATURES COMPLETED OK VIA DEEPSEEK');
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
  console.error('[core-deepseek-live] FAILED:', error);
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
    'verify-snaps-core-deepseek did not finish: a check stopped without',
    'settling, so everything after it was skipped'
  );
  process.exitCode = 1;
});
