import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z
    .string()
    .min(1, "is required")
    .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL"),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CALLBACK_URL: z.url().optional(),
  PROVIDER: z.enum(["none", "fake", "surplus"]).default("none"),
  SURPLUS_ADMIN_KEY: z.string().min(1).optional(),
  SURPLUS_WORKSPACE_ID: z.string().min(1).optional(),
  SURPLUS_BASE_URL: z.url().optional(),
  WEB_DIST_DIR: z.string().min(1).optional(),
  TRUST_PROXY: z.string().trim().min(1).optional(),
});

/**
 * TRUST_PROXY: "false" (default), "true", a number of proxy hops ("2"), or a comma-separated
 * list of proxy addresses or CIDRs ("10.0.0.0/8,127.0.0.1").
 */
function parseTrustProxy(value: string | undefined): boolean | number | string[] | null {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops >= 1 && hops <= 10 ? hops : null;
  }
  const entries = value.split(",").map((v) => v.trim());
  const ipOrCidr = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;
  return entries.every((e) => ipOrCidr.test(e)) ? entries : null;
}

export interface Config {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  databaseUrl: string;
  /** GitHub sign-in. Absent until a GitHub OAuth App is configured; sign-in routes then return 503. */
  github: { clientId: string; clientSecret: string; callbackUrl: string } | null;
  /** Where keys come from. "none": claims can't be issued keys. "fake" is refused in production. */
  provider:
    | { kind: "none" }
    | { kind: "fake" }
    | { kind: "surplus"; adminKey: string; workspaceId: string; baseUrl: string | null };
  /** Built claim website directory; when unset, `web/dist` is used if it exists. */
  webDistDir: string | null;
  /** Proxies trusted for the client IP (see TRUST_PROXY). */
  trustProxy: boolean | number | string[];
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * Reads and validates configuration from environment variables.
 * Error messages name the variable and the problem, never the value, so secrets
 * such as DATABASE_URL are not echoed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  const c = parsed.data;
  const githubValues = [c.GITHUB_CLIENT_ID, c.GITHUB_CLIENT_SECRET, c.GITHUB_CALLBACK_URL];
  const githubSet = githubValues.filter((v) => v !== undefined).length;
  if (githubSet !== 0 && githubSet !== 3) {
    throw new ConfigError([
      "GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_CALLBACK_URL must be set together",
    ]);
  }
  const trustProxy = parseTrustProxy(c.TRUST_PROXY);
  if (trustProxy === null) {
    throw new ConfigError([
      "TRUST_PROXY must be false, true, a hop count from 1 to 10, or a comma-separated list of addresses/CIDRs",
    ]);
  }
  if (c.PROVIDER === "fake" && c.NODE_ENV === "production") {
    throw new ConfigError(["PROVIDER=fake is not allowed in production"]);
  }
  if (c.PROVIDER === "surplus" && (!c.SURPLUS_ADMIN_KEY || !c.SURPLUS_WORKSPACE_ID)) {
    throw new ConfigError(["PROVIDER=surplus requires SURPLUS_ADMIN_KEY and SURPLUS_WORKSPACE_ID"]);
  }
  const provider: Config["provider"] =
    c.PROVIDER === "surplus" && c.SURPLUS_ADMIN_KEY && c.SURPLUS_WORKSPACE_ID
      ? {
          kind: "surplus",
          adminKey: c.SURPLUS_ADMIN_KEY,
          workspaceId: c.SURPLUS_WORKSPACE_ID,
          baseUrl: c.SURPLUS_BASE_URL ?? null,
        }
      : c.PROVIDER === "fake"
        ? { kind: "fake" }
        : { kind: "none" };
  return {
    provider,
    nodeEnv: c.NODE_ENV,
    host: c.HOST,
    port: c.PORT,
    logLevel: c.LOG_LEVEL,
    databaseUrl: c.DATABASE_URL,
    github:
      c.GITHUB_CLIENT_ID && c.GITHUB_CLIENT_SECRET && c.GITHUB_CALLBACK_URL
        ? {
            clientId: c.GITHUB_CLIENT_ID,
            clientSecret: c.GITHUB_CLIENT_SECRET,
            callbackUrl: c.GITHUB_CALLBACK_URL,
          }
        : null,
    webDistDir: c.WEB_DIST_DIR ?? null,
    trustProxy,
  };
}
