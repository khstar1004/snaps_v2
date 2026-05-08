import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return [...values].sort();
}

function sameSet(left, right, label) {
  const leftSorted = sorted(unique(left));
  const rightSorted = sorted(unique(right));
  if (leftSorted.join('\n') !== rightSorted.join('\n')) {
    fail(
      `${label} mismatch\nleft=${leftSorted.join(', ')}\nright=${rightSorted.join(', ')}`
    );
  }
}

function arrayLiteral(content, constName) {
  const match = content.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\] as const`));
  if (!match) {
    fail(`Could not find const ${constName}`);
  }
  return match[1];
}

function stringItems(block) {
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function frontendPlatformIds(content) {
  const block = arrayLiteral(content, 'targetPlatforms');
  return [...block.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
}

function frontendDefaultPlatforms(content) {
  const match = content.match(
    /useState<TargetPlatform\[]>\(\[([\s\S]*?)\]\)/
  );
  if (!match) {
    fail('Could not find snaps default selectedPlatforms');
  }
  return stringItems(match[1]);
}

function platformRuleKeys(content) {
  const match = content.match(
    /export const snapsPlatformRules:[\s\S]*?= \{([\s\S]*?)\n\};/
  );
  if (!match) {
    fail('Could not find snapsPlatformRules');
  }
  return [...match[1].matchAll(/^\s*(?:'([^']+)'|([a-z][a-z0-9-]*)):\s*\{/gm)].map(
    (match) => match[1] || match[2]
  );
}

function publishModePlatforms(content, mode) {
  const matches = [];
  for (const platform of platformRuleKeys(content)) {
    const escaped = platform.includes('-') ? `'${platform}'` : platform;
    const ruleMatch = content.match(
      new RegExp(`${escaped}: \\{([\\s\\S]*?)\\n\\s*\\},`)
    );
    if (ruleMatch?.[1]?.includes(`publishMode: '${mode}'`)) {
      matches.push(platform);
    }
  }
  return matches;
}

const platformRules = read('libraries/nestjs-libraries/src/snaps/transform/platform-rules.ts');
const transformDto = read('libraries/nestjs-libraries/src/snaps/dto/transform-request.dto.ts');
const sourceDto = read('libraries/nestjs-libraries/src/snaps/dto/source-library.dto.ts');
const feedbackDto = read('libraries/nestjs-libraries/src/snaps/dto/feedback-inbox.dto.ts');
const workspace = read('apps/frontend/src/components/snaps/snaps-workspace.tsx');
const videoBuilder = read('libraries/nestjs-libraries/src/snaps/video/video-variant.builder.ts');

const backendPlatforms = stringItems(arrayLiteral(platformRules, 'snapsTargetPlatforms'));
const frontendPlatforms = frontendPlatformIds(workspace);
const rulePlatforms = platformRuleKeys(platformRules);
const defaultPlatforms = frontendDefaultPlatforms(workspace);
const assistPlatforms = publishModePlatforms(platformRules, 'assist');
const schedulePlatforms = publishModePlatforms(platformRules, 'schedule');
const videoPlatforms = stringItems(arrayLiteral(videoBuilder, 'videoPlatforms'));

sameSet(backendPlatforms, frontendPlatforms, 'frontend targetPlatforms vs backend snapsTargetPlatforms');
sameSet(backendPlatforms, rulePlatforms, 'snapsPlatformRules keys vs snapsTargetPlatforms');

for (const platform of defaultPlatforms) {
  if (!backendPlatforms.includes(platform)) {
    fail(`default selected platform ${platform} is not a snaps target platform`);
  }
}

for (const platform of videoPlatforms) {
  if (!backendPlatforms.includes(platform)) {
    fail(`video platform ${platform} is not a snaps target platform`);
  }
  if (!schedulePlatforms.includes(platform)) {
    fail(`video platform ${platform} must be schedulable`);
  }
}

sameSet(assistPlatforms, ['naver-blog', 'kakao-talk'], 'assist-only platform set');

for (const dto of [
  ['transform-request.dto.ts', transformDto],
  ['source-library.dto.ts', sourceDto],
  ['feedback-inbox.dto.ts', feedbackDto],
]) {
  if (!dto[1].includes('snapsTargetPlatforms')) {
    fail(`${dto[0]} does not validate against snapsTargetPlatforms`);
  }
}

if (!platformRules.includes("return normalized.length ? [...new Set(normalized)]")) {
  fail('normalizeTargetPlatforms must dedupe requested platforms');
}
if (!workspace.includes("type TargetPlatform = (typeof targetPlatforms)[number]['id'];")) {
  fail('SnapsWorkspace TargetPlatform must derive from the UI target platform list');
}

console.log(
  `verify-snaps-platform-contract-ok platforms=${backendPlatforms.length} schedule=${schedulePlatforms.length} assist=${assistPlatforms.length} video=${videoPlatforms.length}`
);
