import { existsSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const targets = process.argv.slice(2);

if (!targets.length) {
  console.error('Usage: node scripts/clean-path.mjs <relative-path> [...]');
  process.exit(1);
}

for (const target of targets) {
  const resolved = resolve(repoRoot, target);
  const relation = relative(repoRoot, resolved);
  const insideRepo =
    relation &&
    relation !== '..' &&
    !relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);

  if (!insideRepo) {
    console.error(`Refusing to remove path outside repository: ${target}`);
    process.exit(1);
  }

  if (existsSync(resolved)) {
    rmSync(resolved, { recursive: true, force: true });
  }
}
