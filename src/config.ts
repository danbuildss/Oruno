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
});

export interface Config {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  databaseUrl: string;
  /** GitHub sign-in. Absent until a GitHub OAuth App is configured; sign-in routes then return 503. */
  github: { clientId: string; clientSecret: string; callbackUrl: string } | null;
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
  return {
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
  };
}
