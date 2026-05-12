import { readFileSync } from 'node:fs';

const demo = JSON.parse(readFileSync('docs/snaps-demo-workspace.json', 'utf8'));

const validPlatforms = new Set([
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'xiaohongshu',
  'naver-blog',
  'naver-cafe',
  'kakao-talk',
  'linkedin',
  'x',
]);
const validSentiments = new Set([
  'question',
  'praise',
  'complaint',
  'spam',
  'collaboration',
  'other',
]);
const validActivityTypes = new Set([
  'transform',
  'draft',
  'rag',
  'source',
  'report',
  'video',
  'inbox',
  'delete',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArray(name) {
  assert(Array.isArray(demo[name]), `demo workspace ${name} must be an array`);
  assert(demo[name].length > 0, `demo workspace ${name} must not be empty`);
}

assert(demo.product === 'snaps', 'demo workspace product must be snaps');
assert(demo.kind === 'workspace-demo', 'demo workspace kind must be workspace-demo');
assert(typeof demo.exportedAt === 'string', 'demo workspace exportedAt is required');

for (const name of ['sources', 'styleExamples', 'reports', 'inboxItems', 'activity']) {
  assertArray(name);
}

for (const source of demo.sources) {
  assert(typeof source.id === 'string' && source.id, 'source id is required');
  assert(
    typeof source.sourceText === 'string' && source.sourceText.trim().length >= 5,
    `source ${source.id} needs usable sourceText`
  );
}

for (const example of demo.styleExamples) {
  assert(typeof example.id === 'string' && example.id, 'style example id is required');
  assert(
    validPlatforms.has(example.platform),
    `style example ${example.id} has invalid platform ${example.platform}`
  );
  assert(
    typeof example.content === 'string' && example.content.trim().length >= 5,
    `style example ${example.id} needs content`
  );
}

for (const report of demo.reports) {
  assert(typeof report.id === 'string' && report.id, 'report id is required');
  assert(typeof report.title === 'string' && report.title, `report ${report.id} needs title`);
  assert(
    report.report && typeof report.report === 'object' && !Array.isArray(report.report),
    `report ${report.id} needs an object report payload`
  );
  assert(
    Array.isArray(report.report.insights) && Array.isArray(report.report.actionItems),
    `report ${report.id} needs insights and actionItems arrays`
  );
}

for (const item of demo.inboxItems) {
  assert(typeof item.id === 'string' && item.id, 'inbox item id is required');
  assert(validPlatforms.has(item.platform), `inbox item ${item.id} has invalid platform`);
  assert(validSentiments.has(item.sentiment), `inbox item ${item.id} has invalid sentiment`);
  assert(
    typeof item.content === 'string' && item.content.trim().length >= 5,
    `inbox item ${item.id} needs content`
  );
}

for (const entry of demo.activity) {
  assert(typeof entry.id === 'string' && entry.id, 'activity id is required');
  assert(validActivityTypes.has(entry.type), `activity ${entry.id} has invalid type`);
  assert(typeof entry.title === 'string' && entry.title, `activity ${entry.id} needs title`);
}

console.log(
  `verify-snaps-demo-ok sources=${demo.sources.length} styleExamples=${demo.styleExamples.length} reports=${demo.reports.length} inbox=${demo.inboxItems.length} activity=${demo.activity.length}`
);
