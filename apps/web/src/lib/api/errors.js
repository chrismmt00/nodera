import { createLogger } from "@nodera/shared";
import crypto from "node:crypto";

// Every non-2xx response uses { error: { code, message } } with codes from
// docs/api.md. This module is the single place that maps codes to statuses.
const ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 400,
  model_not_found: 404,
  input_too_large: 400,
  idempotency_conflict: 409,
  rate_limited: 429,
  artifact_limits_exceeded: 400,
  artifact_missing: 400,
  report_conflict: 409,
  internal: 500,
};

export class ApiError extends Error {
  constructor(code, message, headers) {
    super(message);
    if (!(code in ERROR_STATUS)) throw new Error(`Unknown API error code: ${code}`);
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.headers = headers;
  }
}

export function errorResponse(err) {
  return Response.json(
    { error: { code: err.code, message: err.message } },
    { status: err.status, headers: err.headers }
  );
}

const log = createLogger("web");

// Wraps a route handler: ApiError becomes its contract response, anything
// else is logged with a request id and returned as a generic internal error.
export function withRoute(handler) {
  return async (request, ctx) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const url = new URL(request.url);
    let response;
    try {
      response = await handler(request, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        response = errorResponse(err);
      } else {
        log.error("unhandled route error", {
          requestId,
          method: request.method,
          path: url.pathname,
          error: err.message,
          stack: err.stack,
        });
        response = errorResponse(new ApiError("internal", "Something went wrong on our side."));
      }
    }
    log.info("request", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Date.now() - started,
    });
    return response;
  };
}
