import { writeFile } from 'node:fs/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { errorMessage } from './event';
import { JobRunner } from './job.runner';
import { OutboxProcessor } from './outbox.processor';
import { WORKER_OPTIONS, type WorkerSettings } from './worker.options';

@Injectable()
export class WorkerService implements OnModuleDestroy {
  private readonly logger = new Logger('Worker');
  private loop: Promise<void> | null = null;
  private stopping = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly outbox: OutboxProcessor,
    private readonly jobs: JobRunner,
    @Inject(WORKER_OPTIONS) private readonly options: WorkerSettings,
  ) {}

  start(): void {
    if (this.loop) return;
    this.stopping = false;
    this.logger.log(
      {
        pollIntervalMs: this.options.pollIntervalMs,
        batchSize: this.options.batchSize,
      },
      'Worker started',
    );
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    if (!this.loop) return;
    this.stopping = true;
    this.wake?.();
    await this.loop;
    this.loop = null;
    this.logger.log('Worker stopped');
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async runOnce(): Promise<boolean> {
    const batch = await this.outbox.processBatch();
    await this.jobs.tick();
    await this.heartbeat();
    return batch.claimed >= this.options.batchSize;
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      let more = false;
      try {
        more = await this.runOnce();
      } catch (error) {
        this.logger.error(
          { error: errorMessage(error) },
          'Worker cycle failed',
        );
      }
      if (!more && !this.stopping)
        await this.sleep(this.options.pollIntervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.wake?.(), ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private async heartbeat(): Promise<void> {
    if (!this.options.heartbeatFile) return;
    await writeFile(this.options.heartbeatFile, String(Date.now()));
  }
}
