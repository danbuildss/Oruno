import { describe, expect, it } from "vitest";
import { pkceChallenge } from "../../src/auth/tokens.js";
import { GitHubError, HttpGitHubClient } from "../../src/github/client.js";

type Call = { url: string; init: RequestInit | undefined };

function mockFetch(responses: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const match = Object.keys(responses).find((prefix) => url.startsWith(prefix));
    if (!match) throw new Error(`unexpected fetch ${url}`);
    return responses[match]?.() as Response;
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const options = {
  clientId: "client-123",
  clientSecret: "secret-456",
  callbackUrl: "https://oruno.example/v1/auth/github/callback",
};

describe("HttpGitHubClient", () => {
  it("builds an authorize URL with state and an S256 PKCE challenge, and no scopes", () => {
    const client = new HttpGitHubClient(options);
    const url = new URL(client.authorizeUrl({ state: "st", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-123",
      redirect_uri: options.callbackUrl,
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      allow_signup: "false",
    });
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("exchanges a code with the PKCE verifier and client secret", async () => {
    const { calls, fetchImpl } = mockFetch({
      "https://github.com/login/oauth/access_token": () =>
        json({ access_token: "gho_abc", token_type: "bearer" }),
    });
    const client = new HttpGitHubClient({ ...options, fetch: fetchImpl });
    expect(await client.exchangeCode({ code: "c1", codeVerifier: "v1" })).toBe("gho_abc");
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      client_id: "client-123",
      client_secret: "secret-456",
      code: "c1",
      redirect_uri: options.callbackUrl,
      code_verifier: "v1",
    });
  });

  it("fails clearly when GitHub refuses the code", async () => {
    const { fetchImpl } = mockFetch({
      "https://github.com/login/oauth/access_token": () => json({ error: "bad_verification_code" }),
    });
    const client = new HttpGitHubClient({ ...options, fetch: fetchImpl });
    await expect(client.exchangeCode({ code: "x", codeVerifier: "y" })).rejects.toThrow(
      /bad_verification_code/,
    );
  });

  it("reads the profile and contributions with the bearer token", async () => {
    const { calls, fetchImpl } = mockFetch({
      "https://api.github.com/user": () =>
        json({
          id: 42,
          login: "octo",
          created_at: "2015-03-01T00:00:00Z",
          public_repos: 12,
          followers: 7,
        }),
      "https://api.github.com/graphql": () =>
        json({
          data: {
            viewer: {
              contributionsCollection: { contributionCalendar: { totalContributions: 321 } },
            },
          },
        }),
    });
    const client = new HttpGitHubClient({ ...options, fetch: fetchImpl });
    const profile = await client.fetchProfile("gho_tok");
    expect(profile).toEqual({
      id: "42",
      login: "octo",
      createdAt: new Date("2015-03-01T00:00:00Z"),
      publicRepos: 12,
      followers: 7,
      contributionsLastYear: 321,
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const headers = (call.init?.headers ?? {}) as Record<string, string>;
      expect(headers.authorization).toBe("Bearer gho_tok");
    }
  });

  it("treats a failed contributions lookup as unknown, not as a sign-in failure", async () => {
    const { fetchImpl } = mockFetch({
      "https://api.github.com/user": () =>
        json({
          id: 1,
          login: "a",
          created_at: "2020-01-01T00:00:00Z",
          public_repos: 1,
          followers: 0,
        }),
      "https://api.github.com/graphql": () => json({ message: "nope" }, 502),
    });
    const client = new HttpGitHubClient({ ...options, fetch: fetchImpl });
    expect((await client.fetchProfile("t")).contributionsLastYear).toBeNull();
  });

  it("rejects an unexpected /user response", async () => {
    const { fetchImpl } = mockFetch({
      "https://api.github.com/user": () => json({ login: "no-id" }),
    });
    const client = new HttpGitHubClient({ ...options, fetch: fetchImpl });
    await expect(client.fetchProfile("t")).rejects.toBeInstanceOf(GitHubError);
  });

  it("computes the RFC 7636 test vector for PKCE S256", () => {
    // RFC 7636 Appendix B.
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
