import { type DestinationStream, type Logger, pino } from "pino";

/**
 * Log paths whose values are replaced before anything is written.
 * Covers request headers that carry credentials and any field named like a secret.
 */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  'req.headers["x-api-key"]',
  "req.headers.cookie",
  "headers.authorization",
  "authorization",
  "databaseUrl",
  "DATABASE_URL",
  "*.databaseUrl",
  "apiKey",
  "*.apiKey",
  "key",
  "*.key",
  "secret",
  "*.secret",
  "password",
  "*.password",
  "token",
  "*.token",
];

export const REDACTION_CENSOR = "[REDACTED]";

export function createLogger(
  options: { level: string; pretty?: boolean },
  destination?: DestinationStream,
): Logger {
  const base = {
    level: options.level,
    redact: { paths: REDACTED_PATHS, censor: REDACTION_CENSOR },
  };
  if (destination) return pino(base, destination);
  if (options.pretty) {
    return pino({ ...base, transport: { target: "pino-pretty" } });
  }
  return pino(base);
}
