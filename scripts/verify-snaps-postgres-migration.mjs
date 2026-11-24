import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const schemaPath = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const migrationPath = 'scripts/snaps-postgres-migration.sql';
const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const shouldCheckLive = shouldApply || args.has('--check-live');

function fail(message) {
  throw new Error(message);
}

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
  });
  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}`);
  }
}

function runPrisma(commandArgs, label) {
  const prismaJs = 'node_modules/prisma/build/index.js';
  if (existsSync(prismaJs)) {
    run('node', [prismaJs, ...commandArgs], label);
    return;
  }
  run('node_modules\\.bin\\prisma.cmd', commandArgs, label);
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

function parseMigration(sql) {
  const tables = new Map();
  const tableRegex = /CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/g;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(sql))) {
    const [, tableName, block] = tableMatch;
    tables.set(tableName, {
      columns: [
        ...block.matchAll(/^\s+"([^"]+)"\s+[A-Z]/gm),
      ].map((match) => match[1]),
      constraints: [
        ...block.matchAll(/CONSTRAINT "([^"]+)"/g),
      ].map((match) => match[1]),
      indexes: [],
      triggers: [],
    });
  }

  for (const match of sql.matchAll(
    /CREATE INDEX IF NOT EXISTS "([^"]+)"\s+ON "([^"]+)"/g
  )) {
    const [, indexName, tableName] = match;
    const table = tables.get(tableName);
    if (!table) {
      fail(`SQL index ${indexName} references unknown table ${tableName}`);
    }
    table.indexes.push(indexName);
  }

  for (const match of sql.matchAll(
    /CREATE TRIGGER "([^"]+)"\s+BEFORE UPDATE ON "([^"]+)"/g
  )) {
    const [, triggerName, tableName] = match;
    const table = tables.get(tableName);
    if (!table) {
      fail(`SQL trigger ${triggerName} references unknown table ${tableName}`);
    }
    table.triggers.push(triggerName);
  }

  if (!tables.size) {
    fail(`${migrationPath} does not define snaps tables`);
  }

  return tables;
}

async function verifyLiveDatabase(tables) {
  loadDotEnv('.env');
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL is required for --check-live or --apply');
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    for (const [tableName, expected] of tables) {
      const columns = await prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `;
      const columnNames = new Set(columns.map((row) => row.column_name));
      for (const column of expected.columns) {
        if (!columnNames.has(column)) {
          fail(`Live database is missing ${tableName}.${column}`);
        }
      }

      const indexes = await prisma.$queryRaw`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ${tableName}
      `;
      const indexNames = new Set(indexes.map((row) => row.indexname));
      for (const index of expected.indexes) {
        if (!indexNames.has(index)) {
          fail(`Live database is missing index ${index}`);
        }
      }

      const constraints = await prisma.$queryRaw`
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = ${tableName}
      `;
      const constraintNames = new Set(constraints.map((row) => row.conname));
      for (const constraint of expected.constraints) {
        if (!constraintNames.has(constraint)) {
          fail(`Live database is missing constraint ${constraint}`);
        }
      }

      const triggers = await prisma.$queryRaw`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'public' AND event_object_table = ${tableName}
      `;
      const triggerNames = new Set(triggers.map((row) => row.trigger_name));
      for (const trigger of expected.triggers) {
        if (!triggerNames.has(trigger)) {
          fail(`Live database is missing trigger ${trigger}`);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

const sql = readFileSync(migrationPath, 'utf8');
const tables = parseMigration(sql);
const totalColumns = [...tables.values()].reduce(
  (total, table) => total + table.columns.length,
  0
);
const totalIndexes = [...tables.values()].reduce(
  (total, table) => total + table.indexes.length,
  0
);
const totalTriggers = [...tables.values()].reduce(
  (total, table) => total + table.triggers.length,
  0
);
const totalConstraints = [...tables.values()].reduce(
  (total, table) => total + table.constraints.length,
  0
);

run('node', ['scripts/verify-snaps-db-contract.mjs'], 'snaps DB contract');

if (shouldApply) {
  if (process.env.SNAPS_SQL_MIGRATION_CONFIRM !== 'apply') {
    fail("SNAPS_SQL_MIGRATION_CONFIRM must be set to 'apply' for --apply");
  }
  runPrisma(
    ['db', 'execute', '--file', migrationPath, '--schema', schemaPath],
    'snaps PostgreSQL SQL migration'
  );
}

if (shouldCheckLive) {
  await verifyLiveDatabase(tables);
}

const mode = shouldApply
  ? 'applied'
  : shouldCheckLive
    ? 'live-check'
    : 'contract-only';

console.log(
  `verify-snaps-postgres-migration-ok mode=${mode} tables=${tables.size} columns=${totalColumns} indexes=${totalIndexes} constraints=${totalConstraints} triggers=${totalTriggers}`
);
