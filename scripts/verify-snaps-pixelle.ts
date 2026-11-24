import { OllamaClient } from '@gitroom/nestjs-libraries/snaps/ai/ollama.client';
import { SnapsShortVideoService } from '@gitroom/nestjs-libraries/snaps/video/short-video.service';

type PixelleResult = {
  jobId?: unknown;
  id?: unknown;
  status?: unknown;
  videoUrl?: unknown;
  url?: unknown;
};

class DryRunOllama extends OllamaClient {
  provider(): 'ollama' | 'deepseek' {
    return 'ollama';
  }
  async chatJson<T>(): Promise<T> {
    throw new Error('Pixelle verifier uses deterministic fallback script generation.');
  }
}

const dryRun = process.argv.includes('--dry-run');
const smokeId =
  process.env.SNAPS_PIXELLE_SMOKE_ID ||
  `snaps-pixelle-${new Date().toISOString().replace(/[:.]/g, '-')}`;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for live Pixelle verification.`);
  }
  return value;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function pixelleJobId(result: PixelleResult) {
  return stringValue(result.jobId) || stringValue(result.id);
}

function pixelleVideoUrl(result: PixelleResult) {
  return stringValue(result.videoUrl) || stringValue(result.url);
}

let completed = false;
let failed = false;

async function main() {
  const service = new SnapsShortVideoService(new DryRunOllama());
  const sourceText =
    process.env.SNAPS_PIXELLE_SOURCE_TEXT ||
    `snaps Pixelle smoke ${smokeId}: 한국형 SNS 콘텐츠를 쇼츠 영상으로 변환합니다.`;
  const durationSeconds = Number(process.env.SNAPS_PIXELLE_DURATION || 30) as
    | 30
    | 45
    | 60;
  const platform =
    (process.env.SNAPS_PIXELLE_PLATFORM as 'instagram' | 'youtube' | 'tiktok') ||
    'tiktok';

  const script = await service.script({
    sourceText,
    durationSeconds,
    platform,
  });

  if (!script.storyboard.length || !script.uploadMetadata.hashtags.length) {
    throw new Error('Pixelle smoke script did not include storyboard and upload metadata.');
  }

  if (dryRun) {
    // The dry run is a finish, not a hang. Without this the sentinel below
    // fired on every offline run: the script printed its own -dry-run-ok
    // line and still exited 1, which took the whole preflight down with it.
    completed = true;
    console.log(
      `verify-snaps-pixelle-dry-run-ok smokeId=${smokeId} duration=${script.durationSeconds} scenes=${script.storyboard.length}`
    );
    return;
  }

  requireEnv('PIXELLE_VIDEO_URL');
  if (process.env.SNAPS_PIXELLE_CONFIRM !== 'generate') {
    throw new Error(
      'Refusing to submit a Pixelle job. Set SNAPS_PIXELLE_CONFIRM=generate to run the live smoke.'
    );
  }

  const generated = (await service.generate({
    sourceText,
    durationSeconds: script.durationSeconds,
    platform,
  })) as PixelleResult;
  const jobId = pixelleJobId(generated);
  const immediateVideoUrl = pixelleVideoUrl(generated);

  if (!jobId && !immediateVideoUrl) {
    throw new Error('Pixelle live smoke did not return a job id or video URL.');
  }

  let status = stringValue(generated.status) || 'submitted';
  let statusVideoUrl = immediateVideoUrl;
  if (jobId) {
    const statusResult = (await service.status(jobId)) as PixelleResult;
    status = stringValue(statusResult.status) || status;
    statusVideoUrl = pixelleVideoUrl(statusResult) || statusVideoUrl;
  }

  completed = true;
  process.exitCode = 0;
  console.log(
    `verify-snaps-pixelle-ok smokeId=${smokeId} jobId=${jobId || '-'} status=${status} videoUrl=${statusVideoUrl || '-'}`
  );
}

// Failing by default, cleared only when main() reaches its end.
//
// A promise that never settles does not hold the Node event loop open, so an
// await that hangs does not fail this script - it ends it, with every check
// after that point skipped and an exit code of 0. Measured on the controller
// smoke: deleting the analytics timeout stopped the run at that check and it
// still reported success.
process.exitCode = 1;

void main().catch((error) => {
  failed = true;
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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
    'verify-snaps-pixelle did not finish: a check stopped without',
    'settling, so everything after it was skipped'
  );
  process.exitCode = 1;
});
