import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config.js";

const valid = { DATABASE_URL: "postgres://user:pw@localhost:5432/db" };

describe("loadConfig", () => {
  it("applies defaults when only DATABASE_URL is set", () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 3000,
      logLevel: "info",
      databaseUrl: valid.DATABASE_URL,
      github: null,
      provider: { kind: "none" },
    });
  });

  it("reads GitHub settings when all three are set", () => {
    const config = loadConfig({
      ...valid,
      GITHUB_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "secret",
      GITHUB_CALLBACK_URL: "https://oruno.example/v1/auth/github/callback",
    });
    expect(config.github).toEqual({
      clientId: "id",
      clientSecret: "secret",
      callbackUrl: "https://oruno.example/v1/auth/github/callback",
    });
  });

  it("selects the fake provider outside production and refuses it in production", () => {
    expect(loadConfig({ ...valid, PROVIDER: "fake" }).provider).toEqual({ kind: "fake" });
    expect(() => loadConfig({ ...valid, PROVIDER: "fake", NODE_ENV: "production" })).toThrow(
      /not allowed in production/,
    );
  });

  it("requires the Surplus admin key and workspace for PROVIDER=surplus", () => {
    expect(() => loadConfig({ ...valid, PROVIDER: "surplus" })).toThrow(/SURPLUS_ADMIN_KEY/);
    expect(
      loadConfig({
        ...valid,
        PROVIDER: "surplus",
        SURPLUS_ADMIN_KEY: "inf_admin_x",
        SURPLUS_WORKSPACE_ID: "ws",
      }).provider,
    ).toEqual({ kind: "surplus", adminKey: "inf_admin_x", workspaceId: "ws", baseUrl: null });
  });

  it("refuses partial GitHub settings", () => {
    expect(() => loadConfig({ ...valid, GITHUB_CLIENT_ID: "id" })).toThrow(/set together/);
  });

  it("reads explicit values and coerces PORT to a number", () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: "production",
      PORT: "8080",
      LOG_LEVEL: "warn",
      HOST: "0.0.0.0",
    });
    expect(config).toMatchObject({
      nodeEnv: "production",
      port: 8080,
      logLevel: "warn",
      host: "0.0.0.0",
    });
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid PORT and NODE_ENV, listing each problem", () => {
    try {
      loadConfig({ ...valid, PORT: "99999", NODE_ENV: "staging" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join("\n");
      expect(problems).toMatch(/PORT/);
      expect(problems).toMatch(/NODE_ENV/);
    }
  });

  it("never includes the DATABASE_URL value in the error message", () => {
    const secretUrl = "postgresx://admin:SuperSecret123@db/x";
    try {
      loadConfig({ DATABASE_URL: secretUrl });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("SuperSecret123");
    }
  });
});
