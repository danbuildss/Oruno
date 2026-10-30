import type { FastifyReply, FastifyRequest } from "fastify";
import { findOperatorByKey, type Operator } from "../auth/operator-keys.js";
import type { Db } from "../db/client.js";
import { AppError } from "./errors.js";

declare module "fastify" {
  interface FastifyRequest {
    operator?: Operator;
  }
}

/** Returns a preHandler that requires `Authorization: Bearer <operator key>`. */
export function requireOperator(db: Db) {
  return async function operatorAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer (\S+)$/);
    if (!match?.[1]) {
      throw new AppError(401, "unauthorized", "An operator API key is required.");
    }
    const operator = await findOperatorByKey(db, match[1]);
    if (!operator) {
      throw new AppError(401, "unauthorized", "The operator API key is invalid or disabled.");
    }
    request.operator = operator;
  };
}
