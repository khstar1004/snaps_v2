import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function read(path) {
  return readFileSync(path, 'utf8');
}

/**
 * Asks the static verifier how many checks it actually ran.
 *
 * This used to count `expect*(` call sites in the verifier's source, which is
 * only an approximation: a guard emitted from a loop or a helper contributes
 * one call site but several checks, so the documented total silently drifted
 * from the real one. Running the verifier reports ground truth instead.
 */
function staticVerifierCheckCountFromRun() {
  let output;
  try {
    output = execFileSync('node', ['scripts/verify-snaps-static.mjs'], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      'scripts/verify-snaps-static.mjs failed, so its check count cannot be ' +
        `confirmed: ${String((error.stderr || error.message || '').split('\n')[0]).slice(0, 200)}`
    );
  }
  const match = /verify-snaps-static-ok \((\d+) checks\)/.exec(output);
  if (!match) {
    throw new Error(
      'scripts/verify-snaps-static.mjs did not report a check count in its summary line'
    );
  }
  return Number(match[1]);
}

function expectContains(content, needle, label = needle) {
  if (!content.includes(needle)) {
    throw new Error(`Missing audit evidence: ${label}`);
  }
}

const audit = read('docs/snaps-completion-audit.md');
const readme = read('README.md');
const packageJson = JSON.parse(read('package.json'));
const staticVerifierCheckCount = staticVerifierCheckCountFromRun();
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

// Derived from package.json rather than hand-listed. The hand-written list had
// gone stale: verify:snaps:core-deepseek, verify:snaps:cardnews-deepseek and
// verify:snaps:spec-types all existed and none of the three was required, so the
// completion audit - the document that states what has been verified - never
// mentioned the live DeepSeek runs at all. A list you have to remember to update
// is a list that drifts; this one cannot.
const requiredScripts = Object.keys(packageJson.scripts || {})
  .filter((name) => name === 'verify:snaps' || name.startsWith('verify:snaps:'))
  .sort();
if (requiredScripts.length < 20) {
  throw new Error(
    `package.json exposes only ${requiredScripts.length} verify:snaps scripts; the ` +
      'filter this verifier derives them with has probably stopped matching'
  );
}
for (const scriptName of requiredScripts) {
  expectContains(readme, scriptName, `README command ${scriptName}`);
  expectContains(audit, scriptName, `completion audit command ${scriptName}`);
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

// The audit quotes each verifier's summary line as its evidence, and only the
// static verifier's count was ever checked against reality. The rest drifted:
// the API contract line still said controller=37 when the controller had 50
// routes, and the runtime smoke line claimed "0 explicit automation exemptions"
// when 13 routes were exempt - a completeness document reading as more complete
// than the repository was. These verifiers all run in under 100ms, so the
// numbers can simply be produced and compared instead of copied by hand.
const summaryVerifiers = [
  'verify-snaps-api-contract.mjs',
  'verify-snaps-frontend-surface.mjs',
  'verify-snaps-product-shell.mjs',
  'verify-snaps-db-contract.mjs',
  'verify-snaps-platform-contract.mjs',
  'verify-snaps-provider-contract.mjs',
  'verify-snaps-runtime-contract.mjs',
  'verify-snaps-demo-workspace.mjs',
  'verify-snaps-pixelle-contract.mjs',
  'verify-snaps-shorts-maker-contract.mjs',
];
for (const scriptFile of summaryVerifiers) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [`scripts/${scriptFile}`], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `scripts/${scriptFile} failed while the audit was collecting its summary: ` +
        `${error.message.split('\n')[0]}`
    );
  }
  const summary = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('verify-snaps-') && line.includes('-ok'))
    .pop();
  if (!summary) {
    throw new Error(`scripts/${scriptFile} printed no summary line to compare`);
  }
  if (!audit.includes(summary)) {
    throw new Error(
      `docs/snaps-completion-audit.md quotes a stale summary for ${scriptFile}; ` +
        `it currently prints: ${summary}`
    );
  }
}

console.log(
  `verify-snaps-audit-ok sections=${requiredSections.length} openGates=${requiredOpenGates.length} scripts=${requiredScripts.length}`
);
