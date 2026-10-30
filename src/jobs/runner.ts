import { PgBoss } from "pg-boss";
import type { Logger } from "pino";

export type JobHandler<T extends object> = (data: T) => Promise<void>;

/**
 * Background jobs, stored in Postgres (pg-boss) so there is no extra service to run.
 * Each job's data must not contain secrets; it is stored in the database.
 */
export class JobRunner {
  private readonly boss: PgBoss;

  constructor(
    databaseUrl: string,
    private readonly logger: Logger,
  ) {
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
    await this.boss.createQueue(queue);
    await this.boss.work<T>(queue, async (jobs) => {
      for (const job of jobs) {
        this.logger.info({ queue, jobId: job.id }, "job started");
        await handler(job.data);
        this.logger.info({ queue, jobId: job.id }, "job finished");
      }
    });
  }

  async send<T extends object>(queue: string, data: T): Promise<string | null> {
    await this.boss.createQueue(queue);
    return this.boss.send(queue, data);
  }
}
