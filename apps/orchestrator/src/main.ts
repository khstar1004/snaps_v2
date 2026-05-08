import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { Connection } from '@temporalio/client';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

type TemporalProbeResult = {
  ok: boolean;
  address: string;
  namespace: string;
  error?: string;
};

const temporalTimeoutMs = Number(
  process.env.TEMPORAL_BOOTSTRAP_TIMEOUT_MS || 5000
);

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), temporalTimeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

async function probeTemporalNamespace(): Promise<TemporalProbeResult> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  let connection: Connection | undefined;

  try {
    connection = await withTimeout(
      Connection.connect({
        address,
        ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
        ...(process.env.TEMPORAL_API_KEY
          ? { apiKey: process.env.TEMPORAL_API_KEY }
          : {}),
      }),
      `Temporal connection timed out after ${temporalTimeoutMs}ms`
    );

    await withTimeout(
      connection.workflowService.describeNamespace({ namespace }),
      `Temporal namespace check timed out after ${temporalTimeoutMs}ms`
    );

    return { ok: true, address, namespace };
  } catch (error) {
    return {
      ok: false,
      address,
      namespace,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection?.close().catch(() => {});
  }
}

async function bootstrap() {
  if (
    process.env.TEMPORAL_STRICT_WORKERS !== 'true' &&
    process.env.TEMPORAL_WORKERS_ENABLED !== 'false'
  ) {
    const temporal = await probeTemporalNamespace();
    if (!temporal.ok) {
      process.env.TEMPORAL_WORKERS_ENABLED = 'false';
      console.warn(
        `Temporal workers disabled for this boot: ${temporal.address}/${temporal.namespace} - ${temporal.error}`
      );
    }
  }

  const { AppModule } = await import('@gitroom/orchestrator/app.module');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
}


bootstrap();
