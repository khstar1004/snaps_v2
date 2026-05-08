import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { join } from 'node:path';

const repoRoot = process.cwd();
const children = new Map();
let shuttingDown = false;

function readDotEnv() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function prefixStream(name, stream, target) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        target.write(`[${name}] ${line}\n`);
      }
    }
  });
}

function stopProcessTree(child) {
  if (!child?.pid || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    return;
  }

  child.kill('SIGTERM');
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    stopProcessTree(child);
  }
  process.exit(code);
}

function start(name, args) {
  const child = spawn(process.execPath, ['scripts/run-pnpm.mjs', ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.set(name, child);
  prefixStream(name, child.stdout, process.stdout);
  prefixStream(name, child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }
    if (code === 0 || signal) {
      return;
    }
    console.error(`[dev] ${name} exited with code ${code}`);
    shutdown(code || 1);
  });

  return child;
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for backend on port ${port}`));
          return;
        }
        setTimeout(attempt, 1500);
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for backend on port ${port}`));
          return;
        }
        setTimeout(attempt, 1500);
      });
    };
    attempt();
  });
}

function isMissingSchemaError(error) {
  const message = `${error?.message || error}`;
  return (
    message.includes('does not exist in the current database') ||
    message.includes('The table `public.User` does not exist') ||
    message.includes('P2021')
  );
}

async function hasRequiredDatabaseSchema() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    await prisma.user.count();
    return true;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return false;
    }
    throw error;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function ensureDatabaseSchema() {
  try {
    if (await hasRequiredDatabaseSchema()) {
      return;
    }
    console.log('[dev] database schema is missing; running prisma db push');
  } catch (error) {
    console.warn(`[dev] database schema preflight failed: ${error.message}`);
    console.warn('[dev] trying prisma db push before starting services');
  }

  const result = spawnSync(
    process.execPath,
    [
      'scripts/run-prisma.mjs',
      'db',
      'push',
      '--accept-data-loss',
      '--schema',
      './libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const env = readDotEnv();
const backendPort = Number(process.env.PORT || env.PORT || 3000);

await ensureDatabaseSchema();

start('extension', ['--filter', './apps/extension', 'run', 'dev']);
start('frontend', ['--filter', './apps/frontend', 'run', 'dev']);
start('backend', ['--filter', './apps/backend', 'run', 'dev']);

try {
  await waitForPort(backendPort, 600000);
  console.log(`[dev] backend is listening on ${backendPort}; starting orchestrator`);
  start('orchestrator', ['--filter', './apps/orchestrator', 'run', 'dev']);
} catch (error) {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
}
