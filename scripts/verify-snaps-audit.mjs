import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function expectContains(content, needle, label = needle) {
  if (!content.includes(needle)) {
    throw new Error(`Missing audit evidence: ${label}`);
  }
}

const audit = read('docs/snaps-completion-audit.md');
const readme = read('README.md');
const staticVerifier = read('scripts/verify-snaps-static.mjs');
const packageJson = JSON.parse(read('package.json'));
const staticVerifierCheckCount = (
  staticVerifier.match(/^\s*expect(?:Contains|NotContains|NotExists|Json|LocaleValuesNotContains)\(/gm) ?? []
).length;
const staticVerifierSummary = `verify-snaps-static-ok (${staticVerifierCheckCount} checks)`;

const requiredSections = [
  '## Objective',
  '## Prompt-To-Artifact Checklist',
  '## Named File And Command Checklist',
  '## Phase Checklist',
  '## Open Runtime Gates',
  '## Current Verification Notes',
];
for (const section of requiredSections) {
  expectContains(audit, section);
}

const requiredOpenGates = [
  '`pnpm install`',
  'Node `22.12.x` runtime readiness',
  'database migration',
  'Postgres TCP reachability',
  'Redis TCP reachability',
  'Temporal TCP reachability',
  'local snaps dev-stack images',
  'runtime test coverage beyond the current focused snaps Jest and service smoke coverage',
  'backend server startup',
  'frontend server startup',
  'authenticated `/snaps/*` API smoke',
  'browser smoke for `/snaps`',
  '`npm run verify:snaps:final`',
  'server-mediated Ollama request',
  'server-mediated embedding request',
  'real connected-channel draft creation',
  'real connected-channel scheduled post creation',
  'real Naver OAuth/Cafe posting',
  'real Pixelle job submission/status',
];
const openGatesSection = audit.split('## Open Runtime Gates')[1]?.split('\n## ')[0] ?? '';
const openGateBullets = openGatesSection.match(/^- /gm) ?? [];
if (openGateBullets.length !== requiredOpenGates.length) {
  throw new Error(
    `Open Runtime Gates bullet count drifted: audit has ${openGateBullets.length}, verifier requires ${requiredOpenGates.length}`
  );
}
for (const gate of requiredOpenGates) {
  expectContains(audit, gate, `open gate ${gate}`);
}

const requiredScripts = [
  'verify:snaps',
  'verify:snaps:env',
  'verify:snaps:audit',
  'verify:snaps:api',
  'verify:snaps:frontend-surface',
  'verify:snaps:product-shell',
  'verify:snaps:runtime-contract',
  'verify:snaps:db',
  'verify:snaps:platforms',
  'verify:snaps:providers',
  'verify:snaps:demo',
  'verify:snaps:naver-cafe',
  'verify:snaps:pixelle',
  'verify:snaps:controller',
  'verify:snaps:services',
  'verify:snaps:preflight',
  'verify:snaps:ollama',
  'verify:snaps:final-guards',
  'verify:snaps:readiness',
  'verify:snaps:readiness:json',
  'verify:snaps:readiness:strict',
  'verify:snaps:dev-images',
  'verify:snaps:handoff',
  'verify:snaps:runtime',
  'verify:snaps:final',
];
for (const scriptName of requiredScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`package.json is missing ${scriptName}`);
  }
  expectContains(readme, scriptName, `README command ${scriptName}`);
}

const requiredClaims = [
  'Keep Postiz as the SNS publishing infrastructure',
  'Leave the remaining runtime gates explicit',
  'The goal is not fully achieved until the open runtime gates are run successfully.',
  'Implemented with structural deviation',
  'Open gate',
  'runtime pending',
  staticVerifierSummary,
];
for (const claim of requiredClaims) {
  expectContains(audit, claim);
}

console.log(
  `verify-snaps-audit-ok sections=${requiredSections.length} openGates=${requiredOpenGates.length} scripts=${requiredScripts.length}`
);
