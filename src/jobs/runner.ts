import { PgBoss } from "pg-boss";
import type { Logger } from "pino";

export type JobHandler<T extends object> = (data: T) => Promise<void>;

/**
 * Every queue retries failed jobs with exponential backoff. Jobs must be idempotent, so a retry
 * after a crash is safe. A job running longer than `expireInSeconds` is treated as failed.
 */
export const QUEUE_OPTIONS = {
  retryLimit: 5,
  retryDelay: 5,
  retryBackoff: true,
  retryDelayMax: 300,
  expireInSeconds: 600,
} as const;

/**
 * Background jobs, stored in Postgres (pg-boss) so there is no extra service to run.
 * Each job's data must not contain secrets; it is stored in the database.
 */
export class JobRunner {
  private readonly boss: PgBoss;

  private readonly queueOptions: typeof QUEUE_OPTIONS | Record<string, number | boolean>;

  constructor(
    databaseUrl: string,
    private readonly logger: Logger,
    /** Override retry timing (tests use short delays). */
    queueOptions: Partial<Record<keyof typeof QUEUE_OPTIONS, number | boolean>> = {},
  ) {
    const merged: Record<string, number | boolean> = { ...QUEUE_OPTIONS, ...queueOptions };
    // pg-boss only accepts a maximum delay together with exponential backoff.
    if (merged.retryBackoff === false) delete merged.retryDelayMax;
    this.queueOptions = merged;
    this.boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
    this.boss.on("error", (error: unknown) =>
      this.logger.error({ err: error }, "job runner error"),
    );
  }

  async start(): Promise<void> {
    await this.boss.start();
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, close: true });
  }

  async register<T extends object>(queue: string, handler: JobHandler<T>): Promise<void> {
    await this.boss.createQueue(queue, this.queueOptions);
    await this.boss.work<T>(queue, async (jobs) => {
      for (const job of jobs) {
        this.logger.info({ queue, jobId: job.id }, "job started");
        await handler(job.data);
        this.logger.info({ queue, jobId: job.id }, "job finished");
      }
    });
  }

  /** Runs `queue` on a cron schedule (UTC). Requires a handler registered with `register`. */
  async schedule(queue: string, cron: string): Promise<void> {
    await this.boss.createQueue(queue, this.queueOptions);
    await this.boss.schedule(queue, cron);
  }

  async send<T extends object>(queue: string, data: T): Promise<string | null> {
    await this.boss.createQueue(queue, this.queueOptions);
    return this.boss.send(queue, data);
  }
}
