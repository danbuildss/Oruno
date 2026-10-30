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

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = {
      error: { code: "not_found", message: "Route not found." },
      requestId: request.id,
    };
    void reply.status(404).send(body);
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
