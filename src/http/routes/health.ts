import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import type { Db } from "../../db/client.js";

export function registerHealthRoutes(app: FastifyInstance, db: Db): void {
  app.get("/health", async (request, reply) => {
    let database: "ok" | "unavailable" = "ok";
    try {
      await sql`select 1`.execute(db);
    } catch (error) {
      database = "unavailable";
      request.log.warn({ err: error }, "health check: database unavailable");
    }
    const healthy = database === "ok";
    return reply
      .status(healthy ? 200 : 503)
      .send({ status: healthy ? "ok" : "degraded", database });
  });
}
