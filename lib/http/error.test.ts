import { describe, expect, it } from "vitest";
import { apiError, badRequest, notFound, serverError, unauthorized } from "./error";

describe("apiError envelope (audit H6)", () => {
  it("apiError wraps message under error.message and sets status", async () => {
    const res = apiError("nope", 418, { code: "teapot", details: { hint: "use coffee" } });
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body).toEqual({
      error: { message: "nope", code: "teapot", details: { hint: "use coffee" } },
    });
  });

  it("apiError omits code and details when not provided", async () => {
    const res = apiError("plain", 500);
    const body = await res.json();
    expect(body).toEqual({ error: { message: "plain" } });
  });

  it("unauthorized() returns 401 with the canonical code", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { message: "Unauthorized", code: "unauthorized" } });
  });

  it("notFound() defaults to 'Not found'", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { message: "Not found", code: "not_found" } });
  });

  it("badRequest() defaults the code to 'bad_request'", async () => {
    const res = badRequest("boom");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { message: "boom", code: "bad_request" } });
  });

  it("serverError() defaults the code to 'internal_error'", async () => {
    const res = serverError("kaboom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { message: "kaboom", code: "internal_error" } });
  });
});
