import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

/**
 * Fails when a --filter names something this workspace does not contain.
 *
 * pnpm answers a filter that matches nothing by printing "No projects matched
 * the filters" and exiting 0. Every script here runs through this wrapper, so
 * `pnpm build` would report success having built nothing the moment a package
 * is renamed or dropped from pnpm-workspace.yaml - and a name filter typed
 * from memory does the same. Measured: `pnpm --filter @gitroom/backend build`
 * in this repo prints that line and exits 0, while the package is called
 * snaps-backend.
 */
function workspacePackages(root) {
  const globs = existsSync(join(root, 'pnpm-workspace.yaml'))
    ? readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim().replace(/^['"]|['"]$/g, ''))
    : [];

  const found = new Map();
  for (const glob of globs) {
    // Only the two shapes this repo uses: `dir/*` and a plain directory.
    const base = glob.endsWith('/*') ? glob.slice(0, -2) : glob;
    const baseDirectory = join(root, base);
    if (!existsSync(baseDirectory)) {
      continue;
    }
    const entries = glob.endsWith('/*')
      ? readdirSync(baseDirectory).map((entry) => join(base, entry))
      : [base];
    for (const relative of entries) {
      const manifest = join(root, relative, 'package.json');
      if (!existsSync(manifest)) {
        continue;
      }
      try {
        const name = JSON.parse(readFileSync(manifest, 'utf8')).name;
        if (name) {
          found.set(name, relative.replaceAll('\\', '/'));
        }
      } catch {
        // A manifest we cannot read is not a filter target either.
      }
    }
  }
  return found;
}

function assertFiltersMatch(argv, root) {
  const filters = [];
  argv.forEach((argument, index) => {
    if (argument === '--filter') {
      filters.push(argv[index + 1]);
    } else if (argument.startsWith('--filter=')) {
      filters.push(argument.slice('--filter='.length));
    }
  });
  if (!filters.length) {
    return;
  }

  const packages = workspacePackages(root);
  const unmatched = [];
  for (const filter of filters) {
    if (!filter) {
      continue;
    }
    // Strip the dependency selectors pnpm allows around a name or path.
    const bare = filter.replace(/^[.]{3}/, '').replace(/[.]{3}$/, '').replace(/\^$/, '');
    if (!bare) {
      continue;
    }
    const isPath = bare.startsWith('./') || bare.startsWith('../') || bare.startsWith('/');
    const matched = isPath
      ? existsSync(join(root, bare, 'package.json'))
      : [...packages.keys()].some(
          (name) => name === bare || (bare.includes('*') && matchesGlob(name, bare))
        );
    if (!matched) {
      unmatched.push(filter);
    }
  }

  if (unmatched.length) {
    console.error(
      `pnpm filter matched no package: ${unmatched.join(', ')}. ` +
        'pnpm exits 0 in that case, so this would report success having run ' +
        `nothing. Known packages: ${[...packages.keys()].sort().join(', ')}`
    );
    process.exit(1);
  }
}

function matchesGlob(value, pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(value);
}

assertFiltersMatch(args, repoRoot);

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
