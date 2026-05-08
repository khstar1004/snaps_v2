import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Connection } from '@temporalio/client';

@Injectable()
export class TemporalRegister implements OnModuleInit {
  private readonly logger = new Logger(TemporalRegister.name);

  constructor(private _client: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.TEMPORAL_TLS === 'true') {
      return;
    }
    const connection = this._client?.client?.getRawClient()
      ?.connection as Connection;
    if (!connection) {
      this.logger.warn('Temporal search attribute registration skipped: client connection is unavailable');
      return;
    }

    const timeoutMs = Number(process.env.TEMPORAL_REGISTER_TIMEOUT_MS || 10000);
    let timeout: NodeJS.Timeout | undefined;
    const timeoutTask = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        this.logger.warn(
          `Temporal search attribute registration skipped after ${timeoutMs}ms timeout`
        );
        resolve();
      }, timeoutMs);
    });

    const registerTask = this.registerMissingSearchAttributes(connection).catch(
      (error) => {
        this.logger.warn(
          `Temporal search attribute registration skipped: ${this.compactError(error)}`
        );
      }
    );

    await Promise.race([registerTask, timeoutTask]);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  private async registerMissingSearchAttributes(connection: Connection) {
    const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const { customAttributes } =
      await connection.operatorService.listSearchAttributes({
        namespace,
      });

    const neededAttribute = ['organizationId', 'postId'];
    const missingAttributes = neededAttribute.filter(
      (attr) => !customAttributes[attr]
    );

    if (missingAttributes.length > 0) {
      await connection.operatorService.addSearchAttributes({
        namespace,
        searchAttributes: missingAttributes.reduce((all, current) => {
          // @ts-ignore
          all[current] = 1;
          return all;
        }, {}),
      });
    }
  }

  private compactError(error: unknown) {
    return error instanceof Error
      ? error.message.replace(/\s+/g, ' ').slice(0, 240)
      : String(error || 'unknown error').replace(/\s+/g, ' ').slice(0, 240);
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TemporalRegister],
  get exports() {
    return this.providers;
  },
})
export class TemporalRegisterMissingSearchAttributesModule {}
