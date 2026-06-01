import { NextResponse } from "next/server";

/**
 * AUDIT H6: standard error envelope for every API route.
 *
 * Wire shape: `{ error: { message, code?, details? } }` — clients should always read
 * `body.error.message` to display, and may inspect `body.error.code` for branching.
 */
export type ApiErrorBody = {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

export function apiError(
  message: string,
  status: number,
  opts: { code?: string; details?: unknown } = {},
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        message,
        ...(opts.code ? { code: opts.code } : {}),
        ...(opts.details !== undefined ? { details: opts.details } : {}),
      },
    },
    { status },
  );
}

export const unauthorized = () => apiError("Unauthorized", 401, { code: "unauthorized" });
export const notFound = (what = "Not found") => apiError(what, 404, { code: "not_found" });
export const badRequest = (message: string, opts: { code?: string; details?: unknown } = {}) =>
  apiError(message, 400, { code: opts.code ?? "bad_request", details: opts.details });
export const serverError = (message: string, opts: { code?: string; details?: unknown } = {}) =>
  apiError(message, 500, { code: opts.code ?? "internal_error", details: opts.details });
