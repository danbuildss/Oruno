import type { FastifyInstance } from "fastify";
import type { Db } from "../../db/client.js";
import { AppError } from "../errors.js";
import { requireOperator } from "../operator-auth.js";

export function registerOperatorRoutes(app: FastifyInstance, db: Db): void {
  const auth = requireOperator(db);

  app.get("/v1/operator/me", { preHandler: auth }, async (request) => {
    const operator = request.operator;
    if (!operator) throw new AppError(401, "unauthorized", "An operator API key is required.");
    return { id: operator.id, name: operator.name, keyPrefix: operator.keyPrefix };
  });
}
