import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const repoRoot = process.cwd();
const pathPnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, commandArgs) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  });
}

function hasPathPnpm() {
  const result =
    process.platform === 'win32'
      ? spawnSync('where.exe', [pathPnpm], { stdio: 'ignore', shell: false })
      : spawnSync('sh', ['-lc', `command -v ${pathPnpm}`], { stdio: 'ignore' });
  return result.status === 0;
}

function findLocalPnpm(startDirectory) {
  if (!existsSync(startDirectory)) {
    return '';
  }

  const stack = [startDirectory];
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry === 'pnpm.cjs' && fullPath.replaceAll('\\', '/').endsWith('/bin/pnpm.cjs')) {
        return fullPath;
      }
    }
  }

  return '';
}

const localPnpm = findLocalPnpm(join(repoRoot, '.corepack', 'v1', 'pnpm'));
let result;
if (hasPathPnpm()) {
  result = run(pathPnpm, args);
}
if (!result || result.error) {
  if (!localPnpm) {
    console.error('pnpm is not on PATH and no repository-local Corepack pnpm.cjs was found.');
    process.exit(1);
  }
  result = run(process.execPath, [localPnpm, ...args]);
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
