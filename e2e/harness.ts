import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createClaim } from "../src/claims/claims.js";
import type { Db } from "../src/db/client.js";
import { transitionDrop } from "../src/drops/drops.js";
import type { GitHubProfile } from "../src/github/client.js";
import { issueKey } from "../src/keys/keys.js";
import { createLogger } from "../src/logger.js";
import { FakeProvider } from "../src/providers/fake.js";
import { LogCapture } from "../tests/helpers/app.js";
import { freshDb } from "../tests/helpers/db.js";
import { FakeGitHub, githubProfile } from "../tests/helpers/fake-github.js";
import { NOW, seedClaimer, seedDrop, seedOperator } from "../tests/helpers/seed.js";

/**
 * Fake GitHub for the browser: "GitHub's" authorize page is a route on the test server that
 * approves (or cancels) as whichever profile the test picked, then redirects to the real
 * callback. PKCE is still enforced by FakeGitHub.
 */
class BrowserFakeGitHub extends FakeGitHub {
  baseUrl = "";
  override authorizeUrl(params: { state: string; codeChallenge: string }): string {
    super.authorizeUrl(params);
    return `${this.baseUrl}/__fake-github/authorize?state=${encodeURIComponent(params.state)}`;
  }
}

export interface Harness {
  baseUrl: string;
  db: Db;
  provider: FakeProvider;
  logs: LogCapture;
  /** Who "signs in on GitHub" next; "cancel" presses Cancel. */
  nextProfile: GitHubProfile | "cancel";
  close: () => Promise<void>;
}

export const POOL = "dans-ai-pool";

export async function startHarness(): Promise<Harness> {
  const db = await freshDb();
  const provider = new FakeProvider();
  const github = new BrowserFakeGitHub();
  const logs = new LogCapture();
  const app: FastifyInstance = await buildApp({
    db,
    logger: createLogger({ level: "info" }, logs),
    github,
    provider,
    clock: () => NOW,
    webDistDir: resolve(import.meta.dirname, "../web/dist"),
  });

  const harness: Harness = {
    baseUrl: "",
    db,
    provider,
    logs,
    nextProfile: githubProfile({ now: NOW }),
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };

  app.get("/__fake-github/authorize", async (request, reply) => {
    const { state } = request.query as { state: string };
    const callback = `/v1/auth/github/callback?state=${encodeURIComponent(state)}`;
    if (harness.nextProfile === "cancel") {
      return reply.redirect(`${callback}&error=access_denied`, 302);
    }
    const code = github.approve(state, harness.nextProfile);
    return reply.redirect(`${callback}&code=${encodeURIComponent(code)}`, 302);
  });

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  harness.baseUrl = `http://127.0.0.1:${address.port}`;
  github.baseUrl = harness.baseUrl;

  // Pools in every state the website must handle.
  const operator = await seedOperator(db);
  await seedDrop(db, operator.id, { slug: POOL, name: "Dan's AI pool", maxClaims: 20 });
  await seedDrop(db, operator.id, { slug: "full-pool", name: "Weekend builders", maxClaims: 1 });
  const someone = await seedClaimer(db);
  const taken = await createClaim(db, {
    dropSlug: "full-pool",
    personId: someone.personId,
    identityId: someone.identityId,
    termsVersion: "2026-10-30",
    now: NOW,
  });
  await issueKey(db, provider, { claimId: taken.id, now: NOW });
  const ended = await seedDrop(db, operator.id, { slug: "ended-pool", name: "October pool" });
  await transitionDrop(db, {
    dropId: ended.id,
    to: "ended",
    actor: { type: "operator", id: operator.id },
    now: NOW,
  });
  await seedDrop(db, operator.id, {
    slug: "soon-pool",
    name: "Next week's pool",
    startsAt: "2026-11-10T00:00:00Z",
    endsAt: "2026-11-24T00:00:00Z",
  });
  await seedDrop(db, operator.id, { slug: "busy-pool", name: "Busy pool" });

  return harness;
}
