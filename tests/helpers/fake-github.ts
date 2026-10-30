import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pkceChallenge } from "../../src/auth/tokens.js";
import { type GitHubClient, GitHubError, type GitHubProfile } from "../../src/github/client.js";

/**
 * Behaves like GitHub's OAuth flow for tests, including the PKCE check:
 * a code can only be exchanged with the verifier matching the challenge it was issued for.
 */
export class FakeGitHub implements GitHubClient {
  private readonly challengesByState = new Map<string, string>();
  private readonly codes = new Map<
    string,
    { challenge: string; profile: GitHubProfile; used: boolean }
  >();
  private readonly tokens = new Map<string, GitHubProfile>();
  exchangeAttempts = 0;

  authorizeUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
    this.challengesByState.set(state, codeChallenge);
    const url = new URL("https://github.test/login/oauth/authorize");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  /** The user approves on GitHub: returns the code GitHub would send to the callback. */
  approve(state: string, profile: GitHubProfile, options: { challenge?: string } = {}): string {
    const challenge = options.challenge ?? this.challengesByState.get(state);
    if (!challenge) throw new Error("unknown state");
    const code = `code_${randomUUID()}`;
    this.codes.set(code, { challenge, profile, used: false });
    return code;
  }

  async exchangeCode({
    code,
    codeVerifier,
  }: {
    code: string;
    codeVerifier: string;
  }): Promise<string> {
    this.exchangeAttempts += 1;
    const entry = this.codes.get(code);
    if (!entry || entry.used) throw new GitHubError("bad_verification_code");
    if (pkceChallenge(codeVerifier) !== entry.challenge)
      throw new GitHubError("invalid code_verifier");
    entry.used = true;
    const token = `gho_${randomUUID()}`;
    this.tokens.set(token, entry.profile);
    return token;
  }

  async fetchProfile(accessToken: string): Promise<GitHubProfile> {
    const profile = this.tokens.get(accessToken);
    if (!profile) throw new GitHubError("bad token");
    return profile;
  }
}

let nextGitHubId = 1000;

export function githubProfile(
  overrides: Partial<GitHubProfile> & { ageDays?: number; now?: Date } = {},
): GitHubProfile {
  const now = overrides.now ?? new Date();
  const id = overrides.id ?? String(nextGitHubId++);
  return {
    id,
    login: overrides.login ?? `dev${id}`,
    createdAt:
      overrides.createdAt ?? new Date(now.getTime() - (overrides.ageDays ?? 400) * 86_400_000),
    publicRepos: overrides.publicRepos ?? 5,
    followers: overrides.followers ?? 3,
    contributionsLastYear:
      overrides.contributionsLastYear === undefined ? 50 : overrides.contributionsLastYear,
  };
}

/** Runs the full sign-in flow through the HTTP API and returns the callback response. */
export async function signInThroughApi(
  app: FastifyInstance,
  github: FakeGitHub,
  profile: GitHubProfile,
  drop?: string,
) {
  const start = await app.inject({
    method: "GET",
    url: `/v1/auth/github/start${drop ? `?drop=${drop}` : ""}`,
  });
  const authorizeUrl = new URL(start.json().authorizeUrl);
  const state = authorizeUrl.searchParams.get("state") ?? "";
  const code = github.approve(state, profile);
  const callback = await app.inject({
    method: "GET",
    url: `/v1/auth/github/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  });
  return { start, callback, state, code };
}
