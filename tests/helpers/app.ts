import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import type { GitHubClient } from "../../src/github/client.js";
import { createLogger } from "../../src/logger.js";

/** Collects every log line the app writes, so tests can inspect them. */
export class LogCapture extends Writable {
  readonly lines: string[] = [];
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.lines.push(chunk.toString("utf8"));
    done();
  }
  get text(): string {
    return this.lines.join("");
  }
}

export async function testApp(
  db: Db,
  options: { github?: GitHubClient | null; clock?: () => Date } = {},
): Promise<{ app: FastifyInstance; logs: LogCapture }> {
  const logs = new LogCapture();
  const logger = createLogger({ level: "info" }, logs);
  const app = await buildApp({
    db,
    logger,
    github: options.github ?? null,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  return { app, logs };
}
