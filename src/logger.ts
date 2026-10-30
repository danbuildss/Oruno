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
  "clientSecret",
  "*.clientSecret",
  "sessionToken",
  "*.sessionToken",
  "code",
  "*.code",
  "state",
  "*.state",
  "req.query.code",
  "req.query.state",
];

export const REDACTION_CENSOR = "[REDACTED]";

/** Request URLs are logged without their query string: OAuth callbacks carry one-time secrets there. */
export function stripQuery(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const at = url.indexOf("?");
  return at === -1 ? url : `${url.slice(0, at)}?[REDACTED]`;
}

const serializers = {
  req(req: { method?: string; url?: string; hostname?: string; ip?: string }) {
    return {
      method: req.method,
      url: stripQuery(req.url),
      host: req.hostname,
      remoteAddress: req.ip,
    };
  },
};

export function createLogger(
  options: { level: string; pretty?: boolean },
  destination?: DestinationStream,
): Logger {
  const base = {
    level: options.level,
    redact: { paths: REDACTED_PATHS, censor: REDACTION_CENSOR },
    serializers,
  };
  if (destination) return pino(base, destination);
  if (options.pretty) {
    return pino({ ...base, transport: { target: "pino-pretty" } });
  }
  return pino(base);
}
