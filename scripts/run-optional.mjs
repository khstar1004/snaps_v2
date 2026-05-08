import { spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-optional.mjs <command> [args...]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.warn(`Optional command failed: ${result.error.message}`);
}

process.exit(0);
