-- snaps PostgreSQL migration helper.
-- Use this only when the project is not using Prisma db push/migrate.
-- The table and column names mirror libraries/nestjs-libraries/src/database/prisma/schema.prisma.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION "snaps_touch_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "SnapsStyleExample" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorType" TEXT,
  "topic" TEXT,
  "tone" TEXT,
  "metrics" JSONB,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SnapsStyleExample_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SnapsStyleExample_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SnapsStyleExample_organizationId_idx"
  ON "SnapsStyleExample"("organizationId");
CREATE INDEX IF NOT EXISTS "SnapsStyleExample_platform_idx"
  ON "SnapsStyleExample"("platform");
CREATE INDEX IF NOT EXISTS "SnapsStyleExample_topic_idx"
  ON "SnapsStyleExample"("topic");
CREATE INDEX IF NOT EXISTS "SnapsStyleExample_createdAt_idx"
  ON "SnapsStyleExample"("createdAt");

DROP TRIGGER IF EXISTS "SnapsStyleExample_touch_updatedAt"
  ON "SnapsStyleExample";
CREATE TRIGGER "SnapsStyleExample_touch_updatedAt"
  BEFORE UPDATE ON "SnapsStyleExample"
  FOR EACH ROW EXECUTE FUNCTION "snaps_touch_updated_at"();

CREATE TABLE IF NOT EXISTS "SnapsMetricSnapshot" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT,
  "postId" TEXT,
  "platform" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "metricValue" DOUBLE PRECISION NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SnapsMetricSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SnapsMetricSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SnapsMetricSnapshot_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SnapsMetricSnapshot_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_organizationId_idx"
  ON "SnapsMetricSnapshot"("organizationId");
CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_integrationId_idx"
  ON "SnapsMetricSnapshot"("integrationId");
CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_postId_idx"
  ON "SnapsMetricSnapshot"("postId");
CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_platform_idx"
  ON "SnapsMetricSnapshot"("platform");
CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_metricKey_idx"
  ON "SnapsMetricSnapshot"("metricKey");
CREATE INDEX IF NOT EXISTS "SnapsMetricSnapshot_collectedAt_idx"
  ON "SnapsMetricSnapshot"("collectedAt");

CREATE TABLE IF NOT EXISTS "SnapsReport" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ready',
  "summary" TEXT,
  "insights" JSONB,
  "charts" JSONB,
  "pdfUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SnapsReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SnapsReport_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SnapsReport_organizationId_idx"
  ON "SnapsReport"("organizationId");
CREATE INDEX IF NOT EXISTS "SnapsReport_status_idx"
  ON "SnapsReport"("status");
CREATE INDEX IF NOT EXISTS "SnapsReport_periodStart_idx"
  ON "SnapsReport"("periodStart");
CREATE INDEX IF NOT EXISTS "SnapsReport_periodEnd_idx"
  ON "SnapsReport"("periodEnd");
CREATE INDEX IF NOT EXISTS "SnapsReport_createdAt_idx"
  ON "SnapsReport"("createdAt");

DROP TRIGGER IF EXISTS "SnapsReport_touch_updatedAt"
  ON "SnapsReport";
CREATE TRIGGER "SnapsReport_touch_updatedAt"
  BEFORE UPDATE ON "SnapsReport"
  FOR EACH ROW EXECUTE FUNCTION "snaps_touch_updated_at"();
