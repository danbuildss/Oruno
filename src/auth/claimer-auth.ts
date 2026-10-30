import { recordAudit } from "../audit/audit.js";
import type { Db } from "../db/client.js";
import type { GitHubClient } from "../github/client.js";
import { AppError } from "../http/errors.js";
import { pkceChallenge, randomToken, sha256Hex } from "./tokens.js";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_TOKEN_PREFIX = "oru_cs_";
const SESSION_TOKEN_PATTERN = /^oru_cs_[A-Za-z0-9_-]{43}$/;

/** Begins GitHub sign-in: stores a single-use state and PKCE verifier, returns the GitHub URL. */
export async function startGitHubSignIn(
  db: Db,
  github: GitHubClient,
  params: { dropSlug: string | null; now: Date },
): Promise<{ authorizeUrl: string }> {
  const state = randomToken();
  const codeVerifier = randomToken();
  await db
    .insertInto("oauth_states")
    .values({
      state_hash: sha256Hex(state),
      provider: "github",
      code_verifier: codeVerifier,
      drop_slug: params.dropSlug,
      expires_at: new Date(params.now.getTime() + OAUTH_STATE_TTL_MS),
      used_at: null,
    })
    .execute();
  return {
    authorizeUrl: github.authorizeUrl({ state, codeChallenge: pkceChallenge(codeVerifier) }),
  };
}

export interface SignInResult {
  sessionToken: string;
  expiresAt: Date;
  personId: string;
  identityId: string;
  login: string;
  dropSlug: string | null;
}

/**
 * Completes GitHub sign-in. The state is consumed atomically, so a replayed or expired
 * callback is refused. The GitHub access token is used once and never stored.
 */
export async function completeGitHubSignIn(
  db: Db,
  github: GitHubClient,
  params: { code: string; state: string; now: Date },
): Promise<SignInResult> {
  const consumed = await db
    .updateTable("oauth_states")
    .set({ used_at: params.now })
    .where("state_hash", "=", sha256Hex(params.state))
    .where("used_at", "is", null)
    .where("expires_at", ">", params.now)
    .returning(["code_verifier", "drop_slug"])
    .executeTakeFirst();
  if (!consumed) {
    throw new AppError(
      400,
      "invalid_state",
      "This sign-in link is invalid, expired or already used.",
    );
  }

  let profile: Awaited<ReturnType<GitHubClient["fetchProfile"]>>;
  try {
    const accessToken = await github.exchangeCode({
      code: params.code,
      codeVerifier: consumed.code_verifier,
    });
    profile = await github.fetchProfile(accessToken);
  } catch (error) {
    throw new AppError(502, "github_unavailable", "Could not complete sign-in with GitHub.", {
      cause: error instanceof Error ? error.message : "unknown",
    });
  }

  const sessionToken = SESSION_TOKEN_PREFIX + randomToken();
  const expiresAt = new Date(params.now.getTime() + SESSION_TTL_MS);

  const result = await db.transaction().execute(async (trx) => {
    const signals = {
      login: profile.login,
      account_created_at: profile.createdAt,
      public_repos: profile.publicRepos,
      followers: profile.followers,
      contributions_last_year: profile.contributionsLastYear,
      signals_checked_at: params.now,
    };
    // Insert-or-update by GitHub user id. Two simultaneous first sign-ins can't create two people:
    // the unique (provider, provider_user_id) constraint makes the second one update instead.
    const existing = await trx
      .selectFrom("identities")
      .select(["id", "person_id"])
      .where("provider", "=", "github")
      .where("provider_user_id", "=", profile.id)
      .forUpdate()
      .executeTakeFirst();

    let identityId: string;
    let personId: string;
    if (existing) {
      await trx.updateTable("identities").set(signals).where("id", "=", existing.id).execute();
      identityId = existing.id;
      personId = existing.person_id;
    } else {
      const person = await trx
        .insertInto("people")
        .values({ blocked_at: null })
        .returning("id")
        .executeTakeFirstOrThrow();
      const identity = await trx
        .insertInto("identities")
        .values({
          person_id: person.id,
          provider: "github",
          provider_user_id: profile.id,
          ...signals,
        })
        .onConflict((oc) => oc.columns(["provider", "provider_user_id"]).doUpdateSet(signals))
        .returning(["id", "person_id"])
        .executeTakeFirstOrThrow();
      identityId = identity.id;
      personId = identity.person_id;
      // A simultaneous sign-in won the race: drop the unused person row we just created.
      if (personId !== person.id) {
        await trx.deleteFrom("people").where("id", "=", person.id).execute();
      }
    }

    const person = await trx
      .selectFrom("people")
      .select("blocked_at")
      .where("id", "=", personId)
      .executeTakeFirstOrThrow();
    if (person.blocked_at) {
      throw new AppError(403, "person_blocked", "This account can't claim from Oruno drops.");
    }

    await trx
      .insertInto("claimer_sessions")
      .values({
        person_id: personId,
        identity_id: identityId,
        token_hash: sha256Hex(sessionToken),
        expires_at: expiresAt,
        revoked_at: null,
      })
      .execute();
    await recordAudit(trx, {
      actorType: "claimer",
      actorId: personId,
      action: "claimer.signed_in",
      subjectType: "identity",
      subjectId: identityId,
      details: { provider: "github", login: profile.login },
    });
    return { personId, identityId };
  });

  return {
    sessionToken,
    expiresAt,
    personId: result.personId,
    identityId: result.identityId,
    login: profile.login,
    dropSlug: consumed.drop_slug,
  };
}

export interface ClaimerSession {
  sessionId: string;
  personId: string;
  identityId: string;
}

export async function findClaimerSession(
  db: Db,
  token: string,
  now: Date,
): Promise<ClaimerSession | null> {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  const row = await db
    .selectFrom("claimer_sessions")
    .innerJoin("people", "people.id", "claimer_sessions.person_id")
    .select([
      "claimer_sessions.id as sessionId",
      "claimer_sessions.person_id as personId",
      "claimer_sessions.identity_id as identityId",
    ])
    .where("claimer_sessions.token_hash", "=", sha256Hex(token))
    .where("claimer_sessions.revoked_at", "is", null)
    .where("claimer_sessions.expires_at", ">", now)
    .where("people.blocked_at", "is", null)
    .executeTakeFirst();
  return row ?? null;
}

export async function revokeClaimerSession(db: Db, sessionId: string, now: Date): Promise<void> {
  await db
    .updateTable("claimer_sessions")
    .set({ revoked_at: now })
    .where("id", "=", sessionId)
    .where("revoked_at", "is", null)
    .execute();
}
