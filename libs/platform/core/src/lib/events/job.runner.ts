import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@dax/platform-db';
import { errorMessage } from './event';
import { HandlerRegistry, type ScheduledJob } from './handler-registry';

export type JobOutcome = 'ran' | 'busy' | 'not-due' | 'failed';

@Injectable()
export class JobRunner {
  private readonly logger = new Logger('Jobs');
  private readonly nextCheck = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: HandlerRegistry,
  ) {}

  async tick(now = Date.now()): Promise<Record<string, JobOutcome>> {
    const outcomes: Record<string, JobOutcome> = {};
    for (const job of this.registry.scheduledJobs()) {
      if ((this.nextCheck.get(job.name) ?? 0) > now) continue;
      outcomes[job.name] = await this.runIfDue(job, new Date(now));
    }
    return outcomes;
  }

  async runIfDue(job: ScheduledJob, now: Date): Promise<JobOutcome> {
    const everyMs = job.everySeconds * 1000;
    this.nextCheck.set(job.name, now.getTime() + everyMs);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(hashtext(${job.name})) AS locked`;
          if (!lock?.locked) return 'busy';
          const last = await tx.jobRun.findUnique({
            where: { name: job.name },
          });
          const lastRunAt = last?.lastRunAt ?? null;
          if (lastRunAt && lastRunAt.getTime() + everyMs > now.getTime()) {
            this.nextCheck.set(job.name, lastRunAt.getTime() + everyMs);
            return 'not-due';
          }
          await job.run({ name: job.name, tx, now, lastRunAt });
          const record = { lastRunAt: now, lastStatus: 'OK', lastError: null };
          await tx.jobRun.upsert({
            where: { name: job.name },
            create: { name: job.name, ...record },
            update: record,
          });
          return 'ran';
        },
        { timeout: job.timeoutSeconds * 1000 },
      );
    } catch (error) {
      const lastError = errorMessage(error);
      this.logger.error(
        { job: job.name, error: lastError },
        'Scheduled job failed',
      );
      const record = { lastRunAt: now, lastStatus: 'FAILED', lastError };
      await this.prisma.jobRun
        .upsert({
          where: { name: job.name },
          create: { name: job.name, ...record },
          update: record,
        })
        .catch((recordError: unknown) => {
          this.logger.error(
            { job: job.name, error: errorMessage(recordError) },
            'Could not record job failure',
          );
        });
      return 'failed';
    }
  }
}
