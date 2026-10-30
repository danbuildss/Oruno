import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { claimView } from "../../claims/claims.js";
import type { Db } from "../../db/client.js";
import type { DropStatus } from "../../db/schema.js";
import { createDrop, dropView, getDrop, listDrops, transitionDrop } from "../../drops/drops.js";
import { createDropSchema } from "../../drops/rules.js";
import { AppError } from "../errors.js";
import { requireOperator } from "../operator-auth.js";

const idParams = z.object({ id: z.uuid() });
const slugParams = z.object({ slug: z.string().min(1).max(64) });

const ACTIONS: Record<string, DropStatus> = {
  activate: "active",
  pause: "paused",
  resume: "active",
  end: "ended",
};

export function registerDropRoutes(
  app: FastifyInstance,
  deps: { db: Db; clock: () => Date },
): void {
  const auth = requireOperator(deps.db);
  const operatorId = (request: { operator?: { id: string } }): string => {
    if (!request.operator)
      throw new AppError(401, "unauthorized", "An operator API key is required.");
    return request.operator.id;
  };

  // --- Operator routes ---
  app.post("/v1/drops", { preHandler: auth }, async (request, reply) => {
    const input = createDropSchema.parse(request.body);
    const drop = await createDrop(deps.db, input, operatorId(request));
    return reply.status(201).send(dropView(drop));
  });

  app.get("/v1/drops", { preHandler: auth }, async () => {
    return { drops: (await listDrops(deps.db)).map(dropView) };
  });

  app.get("/v1/drops/:id", { preHandler: auth }, async (request) => {
    const { id } = idParams.parse(request.params);
    return dropView(await getDrop(deps.db, { id }));
  });

  for (const [action, to] of Object.entries(ACTIONS)) {
    app.post(`/v1/drops/:id/${action}`, { preHandler: auth }, async (request) => {
      const { id } = idParams.parse(request.params);
      if (action === "resume") {
        const current = await getDrop(deps.db, { id });
        if (current.status !== "paused") {
          throw new AppError(409, "invalid_transition", "Only a paused drop can be resumed.");
        }
      }
      const drop = await transitionDrop(deps.db, {
        dropId: id,
        to,
        actor: { type: "operator", id: operatorId(request) },
        now: deps.clock(),
      });
      return dropView(drop);
    });
  }

  app.get("/v1/drops/:id/claims", { preHandler: auth }, async (request) => {
    const { id } = idParams.parse(request.params);
    await getDrop(deps.db, { id });
    const claims = await deps.db
      .selectFrom("claims")
      .selectAll()
      .where("drop_id", "=", id)
      .orderBy("created_at", "asc")
      .execute();
    return { claims: claims.map(claimView) };
  });

  // --- Public route: what a claim page needs to show ---
  app.get("/v1/public/drops/:slug", async (request) => {
    const { slug } = slugParams.parse(request.params);
    const drop = await getDrop(deps.db, { slug });
    if (drop.status === "draft") throw new AppError(404, "drop_not_found", "Drop not found.");
    const view = dropView(drop);
    return {
      slug: view.slug,
      name: view.name,
      status: view.status,
      capMicro: view.capMicro,
      slotsLeft: view.slotsLeft,
      maxClaims: view.maxClaims,
      models: view.models,
      startsAt: view.startsAt,
      endsAt: view.endsAt,
      termsVersion: view.termsVersion,
      eligibility: view.eligibility,
    };
  });
}
