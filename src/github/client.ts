/** What Oruno reads from a GitHub account at sign-in. Only public data. */
export interface GitHubProfile {
  id: string;
  login: string;
  createdAt: Date;
  publicRepos: number;
  followers: number;
  /** Public contributions in the last year, or null if GitHub didn't return it. */
  contributionsLastYear: number | null;
}

export interface GitHubClient {
  authorizeUrl(params: { state: string; codeChallenge: string }): string;
  /** Exchanges an authorization code for an access token. The token is used once and never stored. */
  exchangeCode(params: { code: string; codeVerifier: string }): Promise<string>;
  fetchProfile(accessToken: string): Promise<GitHubProfile>;
}

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface HttpGitHubClientOptions {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const OAUTH_BASE = "https://github.com/login/oauth";
const API_BASE = "https://api.github.com";

/**
 * GitHub OAuth App client: authorization code flow with PKCE (S256).
 * No OAuth scopes are requested, so the token can only read public profile data.
 */
export class HttpGitHubClient implements GitHubClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpGitHubClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  authorizeUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
    const url = new URL(`${OAUTH_BASE}/authorize`);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("allow_signup", "false");
    return url.toString();
  }

  async exchangeCode({
    code,
    codeVerifier,
  }: {
    code: string;
    codeVerifier: string;
  }): Promise<string> {
    const res = await this.fetchImpl(`${OAUTH_BASE}/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        code,
        redirect_uri: this.options.callbackUrl,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: unknown;
      error?: unknown;
    };
    if (!res.ok || typeof body.access_token !== "string" || body.access_token.length === 0) {
      const reason = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
      throw new GitHubError(`GitHub code exchange failed: ${reason}`);
    }
    return body.access_token;
  }

  async fetchProfile(accessToken: string): Promise<GitHubProfile> {
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "oruno",
    };
    const res = await this.fetchImpl(`${API_BASE}/user`, {
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new GitHubError(`GitHub /user failed: HTTP ${res.status}`);
    const user = (await res.json()) as Record<string, unknown>;

    const id = user.id;
    const login = user.login;
    const createdAt = typeof user.created_at === "string" ? new Date(user.created_at) : null;
    if (
      (typeof id !== "number" && typeof id !== "string") ||
      typeof login !== "string" ||
      !createdAt ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new GitHubError("GitHub /user returned an unexpected shape");
    }

    return {
      id: String(id),
      login,
      createdAt,
      publicRepos: nonNegativeInt(user.public_repos),
      followers: nonNegativeInt(user.followers),
      contributionsLastYear: await this.fetchContributions(headers),
    };
  }

  /** Contributions over the last year via GraphQL. Returns null rather than failing sign-in. */
  private async fetchContributions(headers: Record<string, string>): Promise<number | null> {
    try {
      const res = await this.fetchImpl(`${API_BASE}/graphql`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          query:
            "query { viewer { contributionsCollection { contributionCalendar { totalContributions } } } }",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: {
          viewer?: {
            contributionsCollection?: { contributionCalendar?: { totalContributions?: unknown } };
          };
        };
      };
      const total =
        body.data?.viewer?.contributionsCollection?.contributionCalendar?.totalContributions;
      return typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : null;
    } catch {
      return null;
    }
  }
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
