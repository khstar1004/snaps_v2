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
  'production database migration',
  'real connected-channel draft creation with a connected provider account',
  'real connected-channel scheduled post creation with a connected provider account',
  'real connected provider analytics ingestion and comment reply publishing',
  'real Naver OAuth/Cafe posting against a disposable Cafe board',
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
  'verify:snaps:migration',
  'verify:snaps:platforms',
  'verify:snaps:providers',
  'verify:snaps:demo',
  'verify:snaps:scenario',
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
  'The local stack is final-verified for self-contained, sandbox connected-channel, and Pixelle flows, but real external-account gates remain open until disposable provider accounts/integrations are supplied.',
  'Implemented with structural deviation',
  'Open gate',
  'Verified locally',
  staticVerifierSummary,
];
for (const claim of requiredClaims) {
  expectContains(audit, claim);
}

console.log(
  `verify-snaps-audit-ok sections=${requiredSections.length} openGates=${requiredOpenGates.length} scripts=${requiredScripts.length}`
);
