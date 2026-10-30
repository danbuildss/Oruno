import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { getDrop } from "../../drops/drops.js";
import {
  balancesView,
  checkLedgerInvariants,
  dropBalances,
  recordFunding,
  recordReturn,
  releaseClaim,
} from "../../ledger/ledger.js";
import { AppError } from "../errors.js";
import { requireOperator } from "../operator-auth.js";

const idParams = z.object({ id: z.uuid() });
const micro = z
  .string()
  .regex(/^[1-9][0-9]{0,17}$/, "must be a positive whole number of micro-dollars, as a string")
  .transform((v) => BigInt(v));
const txHash = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/, "must be a lowercase 0x-prefixed Base transaction hash");

const fundingBody = z.object({
  amountMicro: micro,
  reference: txHash,
  note: z.string().trim().max(200).optional(),
});
const returnBody = z.object({ amountMicro: micro.optional(), reference: txHash });

export function registerLedgerRoutes(
  app: FastifyInstance,
  deps: { db: Db; clock: () => Date },
): void {
  const auth = requireOperator(deps.db);
  const operatorId = (request: { operator?: { id: string } }): string => {
    if (!request.operator)
      throw new AppError(401, "unauthorized", "An operator API key is required.");
    return request.operator.id;
  };

  app.post("/v1/drops/:id/fundings", { preHandler: auth }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = fundingBody.parse(request.body);
    const result = await recordFunding(deps.db, {
      dropId: id,
      amountMicro: body.amountMicro,
      reference: body.reference,
      note: body.note ?? null,
      operatorId: operatorId(request),
      now: deps.clock(),
    });
    return reply.status(201).send({
      funding: {
        id: result.funding.id,
        amountMicro: result.funding.amount_micro.toString(),
        reference: result.funding.reference,
        confirmedAt: result.funding.confirmed_at.toISOString(),
      },
      balances: balancesView(result.balances),
    });
  });

  app.get("/v1/drops/:id/balances", { preHandler: auth }, async (request) => {
    const { id } = idParams.parse(request.params);
    await getDrop(deps.db, { id });
    return balancesView(await dropBalances(deps.db, id));
  });

  app.post("/v1/drops/:id/returns", { preHandler: auth }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = returnBody.parse(request.body);
    const result = await recordReturn(deps.db, {
      dropId: id,
      amountMicro: body.amountMicro ?? null,
      reference: body.reference,
      operatorId: operatorId(request),
    });
    return reply.status(201).send({
      return: { id: result.fundReturn.id, amountMicro: result.fundReturn.amount_micro.toString() },
      balances: balancesView(result.balances),
    });
  });

  app.post("/v1/claims/:id/release", { preHandler: auth }, async (request) => {
    const { id } = idParams.parse(request.params);
    const result = await releaseClaim(deps.db, {
      claimId: id,
      actor: { type: "operator", id: operatorId(request) },
    });
    return { releasedMicro: result.releasedMicro.toString() };
  });

  app.get("/v1/ledger/check", { preHandler: auth }, async () => {
    const violations = await checkLedgerInvariants(deps.db);
    return { ok: violations.length === 0, violations };
  });
}
