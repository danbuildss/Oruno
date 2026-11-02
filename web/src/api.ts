/** Calls to the Oruno API. The session is an HttpOnly cookie; this code never sees it. */

export interface Pool {
  slug: string;
  name: string;
  status: "active" | "paused" | "ended";
  capMicro: string;
  slotsLeft: number;
  maxClaims: number;
  models: string[];
  startsAt: string;
  endsAt: string;
  termsVersion: string;
}

export interface Claim {
  id: string;
  status: "pending" | "active" | "exhausted" | "expired" | "revoked" | "failed";
  capMicro: string;
  spentMicro?: string;
  remainingMicro?: string;
  keyPrefix?: string | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface MyClaim extends Claim {
  drop: { slug: string; name: string; endsAt: string } | null;
  secretDelivered: boolean;
  rotationsLeft: number;
}

export interface Key {
  secret: string;
  prefix: string;
  setup: { ANTHROPIC_BASE_URL: string; ANTHROPIC_AUTH_TOKEN: string; ANTHROPIC_API_KEY: string };
}

export type PoolProblem = "drop_not_active" | "drop_not_started" | "drop_ended" | "drop_full";

export interface Eligibility {
  eligible: boolean;
  reasons: ("account_too_new" | "not_enough_activity")[];
  accountAgeDays: number;
  problem: PoolProblem | null;
  claim: Claim | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        // Required by the server for any cookie-authenticated change (CSRF guard).
        "x-requested-with": "oruno",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach Oruno. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      error?.code ?? "unknown",
      error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return data as T;
}

export const api = {
  pool: (slug: string) => request<Pool>("GET", `/v1/public/drops/${encodeURIComponent(slug)}`),
  me: () => request<{ login: string; provider: string }>("GET", "/v1/me"),
  eligibility: (slug: string) =>
    request<Eligibility>("GET", `/v1/drops/${encodeURIComponent(slug)}/eligibility`),
  claim: (slug: string, termsVersion: string) =>
    request<{ claim: Claim; key: Key | null; message?: string }>(
      "POST",
      `/v1/drops/${encodeURIComponent(slug)}/claims`,
      { termsVersion, acceptTerms: true, confirmAdult: true, confirmNotSanctioned: true },
    ),
  myClaims: () => request<{ claims: MyClaim[] }>("GET", "/v1/me/claims"),
  key: (claimId: string) => request<{ key: Key }>("POST", `/v1/me/claims/${claimId}/key`),
  revoke: (claimId: string) => request<Claim>("POST", `/v1/me/claims/${claimId}/revoke`),
  signOut: () => request<void>("POST", "/v1/auth/sign-out"),
};

/** Where the sign-in button goes: a normal navigation, so the server can redirect to GitHub. */
export function signInUrl(slug?: string): string {
  return `/v1/auth/github/start${slug ? `?drop=${encodeURIComponent(slug)}` : ""}`;
}

/** Signed out is a normal state, not an error. */
export async function currentUser(): Promise<{ login: string } | null> {
  try {
    return await api.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
