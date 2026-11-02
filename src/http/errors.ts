import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

/** An error that is safe to show to the caller: a stable code, a status and a message. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

/**
 * Database failures a caller can simply retry: lock or statement timeouts, a dropped
 * connection, or the database being unreachable. Returned as 503 with Retry-After.
 */
export function databaseErrorResponse(error: unknown): { code: string; message: string } | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return null;
  if (code === "55P03") return { code: "busy", message: "Busy right now. Please retry." };
  if (code === "57014") return { code: "timeout", message: "That took too long. Please retry." };
  if (
    code.startsWith("08") ||
    ["57P01", "57P02", "57P03", "ECONNREFUSED", "ECONNRESET"].includes(code)
  ) {
    return { code: "database_unavailable", message: "Temporarily unavailable. Please retry." };
  }
  return null;
}

export function registerErrorHandling(
  app: FastifyInstance,
  options: { spaFallback?: boolean } = {},
): void {
  app.setNotFoundHandler((request, reply) => {
    // The claim website is a single-page app: its pages (/p/:slug, /credit, ...) all load
    // index.html. API paths always get a JSON 404.
    if (
      options.spaFallback &&
      (request.method === "GET" || request.method === "HEAD") &&
      !request.url.startsWith("/v1/") &&
      !request.url.startsWith("/health")
    ) {
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    }
    const body: ErrorBody = {
      error: { code: "not_found", message: "Route not found." },
      requestId: request.id,
    };
    return reply.status(404).send(body);
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
        requestId: request.id,
      };
      return reply.status(error.statusCode).send(body);
    }

    if (error instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: "validation_error",
          message: "The request is invalid.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        requestId: request.id,
      };
      return reply.status(400).send(body);
    }

    const dbError = databaseErrorResponse(error);
    if (dbError) {
      request.log.warn({ err: error }, "database unavailable or busy");
      const body: ErrorBody = {
        error: { code: dbError.code, message: dbError.message },
        requestId: request.id,
      };
      return reply.status(503).header("retry-after", "2").send(body);
    }

    // Fastify's own client errors (malformed JSON, body too large, unsupported media type).
    const statusCode = "statusCode" in error ? error.statusCode : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      const body: ErrorBody = {
        error: { code: "bad_request", message: error.message },
        requestId: request.id,
      };
      return reply.status(statusCode).send(body);
    }

    // Anything else is unexpected: log it, and never leak internals to the caller.
    request.log.error({ err: error }, "unhandled error");
    const body: ErrorBody = {
      error: { code: "internal_error", message: "Something went wrong." },
      requestId: request.id,
    };
    return reply.status(500).send(body);
  });
}
