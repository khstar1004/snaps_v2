import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Connection } from '@temporalio/client';
import { temporalTimeoutMs, withTemporalTimeout } from './temporal-timeout';

@Controller('health')
export class HealthController {
  @Get('/status')
  async getHealthStatus(@Res() res: Response) {
    let connection: Connection | undefined;
    const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
    const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const workersEnabled = process.env.TEMPORAL_WORKERS_ENABLED !== 'false';

    try {
      connection = await Connection.connect({
        address,
        ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
        ...(process.env.TEMPORAL_API_KEY
          ? { apiKey: process.env.TEMPORAL_API_KEY }
          : {}),
      });

      await withTemporalTimeout(
        connection.workflowService.describeNamespace({ namespace }),
        'timeout',
        temporalTimeoutMs(process.env.TEMPORAL_BOOTSTRAP_TIMEOUT_MS, 10000)
      );
      return res.status(200).json({
        status: 'ok',
        workerMode: workersEnabled ? 'workers' : 'health-only',
        temporal: { ok: true, address, namespace },
      });
    } catch (error) {
      return res.status(workersEnabled ? 503 : 200).json({
        status: 'degraded',
        workerMode: workersEnabled ? 'workers' : 'health-only',
        temporal: {
          ok: false,
          address,
          namespace,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      await connection?.close().catch(() => {});
    }
  }
}
