import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function modelBlock(schema, model) {
  const match = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    fail(`schema.prisma is missing model ${model}`);
  }
  return match[1];
}

function tableBlock(sql, table) {
  const match = sql.match(
    new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(([\\s\\S]*?)\\n\\);`)
  );
  if (!match) {
    fail(`snaps-postgres-migration.sql is missing table ${table}`);
  }
  return match[1];
}

function expectContains(content, needle, label = needle) {
  if (!content.includes(needle)) {
    fail(`Missing ${label}`);
  }
}

function expectColumn(tableSql, table, column, type) {
  expectContains(tableSql, `"${column}" ${type}`, `${table}.${column} ${type}`);
}

const schema = read('libraries/nestjs-libraries/src/database/prisma/schema.prisma');
const sql = read('scripts/snaps-postgres-migration.sql');

const contracts = [
  {
    model: 'SnapsStyleExample',
    fields: [
      ['id', 'String'],
      ['organizationId', 'String'],
      ['platform', 'String'],
      ['content', 'String'],
      ['authorType', 'String?'],
      ['topic', 'String?'],
      ['tone', 'String?'],
      ['metrics', 'Json?'],
      ['sourceUrl', 'String?'],
      ['createdAt', 'DateTime'],
      ['updatedAt', 'DateTime'],
    ],
    columns: [
      ['id', 'TEXT'],
      ['organizationId', 'TEXT'],
      ['platform', 'TEXT'],
      ['content', 'TEXT'],
      ['authorType', 'TEXT'],
      ['topic', 'TEXT'],
      ['tone', 'TEXT'],
      ['metrics', 'JSONB'],
      ['sourceUrl', 'TEXT'],
      ['createdAt', 'TIMESTAMP(3)'],
      ['updatedAt', 'TIMESTAMP(3)'],
    ],
    indexes: ['organizationId', 'platform', 'topic', 'createdAt'],
    foreignKeys: ['organizationId'],
    touchUpdatedAt: true,
  },
  {
    model: 'SnapsMetricSnapshot',
    fields: [
      ['id', 'String'],
      ['organizationId', 'String'],
      ['integrationId', 'String?'],
      ['postId', 'String?'],
      ['platform', 'String'],
      ['metricKey', 'String'],
      ['metricValue', 'Float'],
      ['collectedAt', 'DateTime'],
      ['createdAt', 'DateTime'],
    ],
    columns: [
      ['id', 'TEXT'],
      ['organizationId', 'TEXT'],
      ['integrationId', 'TEXT'],
      ['postId', 'TEXT'],
      ['platform', 'TEXT'],
      ['metricKey', 'TEXT'],
      ['metricValue', 'DOUBLE PRECISION'],
      ['collectedAt', 'TIMESTAMP(3)'],
      ['createdAt', 'TIMESTAMP(3)'],
    ],
    indexes: [
      'organizationId',
      'integrationId',
      'postId',
      'platform',
      'metricKey',
      'collectedAt',
    ],
    foreignKeys: ['organizationId', 'integrationId', 'postId'],
    touchUpdatedAt: false,
  },
  {
    model: 'SnapsReport',
    fields: [
      ['id', 'String'],
      ['organizationId', 'String'],
      ['title', 'String'],
      ['periodStart', 'DateTime?'],
      ['periodEnd', 'DateTime?'],
      ['status', 'String'],
      ['summary', 'String?'],
      ['insights', 'Json?'],
      ['charts', 'Json?'],
      ['pdfUrl', 'String?'],
      ['createdAt', 'DateTime'],
      ['updatedAt', 'DateTime'],
    ],
    columns: [
      ['id', 'TEXT'],
      ['organizationId', 'TEXT'],
      ['title', 'TEXT'],
      ['periodStart', 'TIMESTAMP(3)'],
      ['periodEnd', 'TIMESTAMP(3)'],
      ['status', 'TEXT'],
      ['summary', 'TEXT'],
      ['insights', 'JSONB'],
      ['charts', 'JSONB'],
      ['pdfUrl', 'TEXT'],
      ['createdAt', 'TIMESTAMP(3)'],
      ['updatedAt', 'TIMESTAMP(3)'],
    ],
    indexes: ['organizationId', 'status', 'periodStart', 'periodEnd', 'createdAt'],
    foreignKeys: ['organizationId'],
    touchUpdatedAt: true,
  },
];

expectContains(sql, 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
expectContains(sql, 'CREATE OR REPLACE FUNCTION "snaps_touch_updated_at"()');

for (const contract of contracts) {
  const prisma = modelBlock(schema, contract.model);
  const table = tableBlock(sql, contract.model);

  for (const [field, type] of contract.fields) {
    const fieldRegex = new RegExp(`^\\s*${field}\\s+${type.replace('?', '\\?')}(?:\\s|$)`, 'm');
    if (!fieldRegex.test(prisma)) {
      fail(`${contract.model}.${field} is not ${type} in schema.prisma`);
    }
  }

  for (const [column, type] of contract.columns) {
    expectColumn(table, contract.model, column, type);
  }

  for (const index of contract.indexes) {
    expectContains(prisma, `@@index([${index}])`, `${contract.model} Prisma index ${index}`);
    expectContains(
      sql,
      `CREATE INDEX IF NOT EXISTS "${contract.model}_${index}_idx"`,
      `${contract.model} SQL index ${index}`
    );
    expectContains(sql, `ON "${contract.model}"("${index}")`, `${contract.model} SQL index column ${index}`);
  }

  for (const key of contract.foreignKeys) {
    expectContains(
      sql,
      `CONSTRAINT "${contract.model}_${key}_fkey"`,
      `${contract.model} SQL foreign key ${key}`
    );
  }

  const hasUpdatedAt = contract.fields.some(([field]) => field === 'updatedAt');
  if (contract.touchUpdatedAt !== hasUpdatedAt) {
    fail(`${contract.model} updatedAt trigger expectation does not match Prisma fields`);
  }
  if (contract.touchUpdatedAt) {
    expectContains(
      sql,
      `CREATE TRIGGER "${contract.model}_touch_updatedAt"`,
      `${contract.model} updatedAt trigger`
    );
  }
}

console.log(
  `verify-snaps-db-contract-ok models=${contracts.length} columns=${contracts.reduce(
    (total, contract) => total + contract.columns.length,
    0
  )} indexes=${contracts.reduce((total, contract) => total + contract.indexes.length, 0)}`
);
