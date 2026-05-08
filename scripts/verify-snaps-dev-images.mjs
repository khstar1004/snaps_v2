import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict');

function read(path) {
  return readFileSync(path, 'utf8');
}

function composeImages(path) {
  const content = read(path);
  return [
    ...new Set(
      [...content.matchAll(/^\s*image:\s*['"]?([^'"\s#]+)['"]?/gm)]
        .map((match) => match[1])
        .filter(Boolean)
    ),
  ].sort();
}

function finish(status, details = {}) {
  const required = details.required ?? 0;
  const missing = details.missing ?? [];
  const available = details.available ?? 0;
  const suffix = [
    `status=${status}`,
    `required=${required}`,
    `available=${available}`,
    `missing=${missing.length}`,
  ].join(' ');
  console.log(`verify-snaps-dev-images-ok ${suffix}`);
  if (missing.length) {
    console.log(`missing images: ${missing.join(', ')}`);
  }
}

const requiredImages = composeImages('docker-compose.dev.yaml');
if (!requiredImages.length) {
  finish('no-images', { required: 0, available: 0, missing: [] });
  process.exit(0);
}

const result = spawnSync('docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'], {
  encoding: 'utf8',
  shell: false,
});

if (result.error || result.status !== 0) {
  const message = [
    result.error?.message,
    result.stderr?.trim(),
    result.stdout?.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  if (strict) {
    console.error(`Docker image list is unavailable: ${message || 'unknown error'}`);
    process.exit(1);
  }
  console.log(`Docker image list is unavailable: ${message || 'unknown error'}`);
  finish('unavailable', {
    required: requiredImages.length,
    available: 0,
    missing: requiredImages,
  });
  process.exit(0);
}

const localImages = new Set(
  result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);
const missingImages = requiredImages.filter((image) => !localImages.has(image));

if (missingImages.length && strict) {
  console.error(`Missing ${missingImages.length} Docker dev image(s): ${missingImages.join(', ')}`);
  process.exit(1);
}

finish(missingImages.length ? 'missing' : 'ready', {
  required: requiredImages.length,
  available: requiredImages.length - missingImages.length,
  missing: missingImages,
});
