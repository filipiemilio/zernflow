import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { isAuthorizedCronRequest } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

const requestWith = (authorization: string | null) =>
  ({
    headers: { get: (name: string) => (name === "authorization" ? authorization : null) },
  }) as unknown as NextRequest;

describe("isAuthorizedCronRequest", () => {
  it("accepts the configured secret, with the Bearer prefix in any case", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCronRequest(requestWith("Bearer s3cret-value"))).toBe(true);
    expect(isAuthorizedCronRequest(requestWith("bearer s3cret-value"))).toBe(true);
  });

  it("rejects a wrong, absent, or truncated secret", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCronRequest(requestWith("Bearer wrong"))).toBe(false);
    expect(isAuthorizedCronRequest(requestWith("Bearer s3cret-valu"))).toBe(false);
    expect(isAuthorizedCronRequest(requestWith("Bearer "))).toBe(false);
    expect(isAuthorizedCronRequest(requestWith(null))).toBe(false);
  });

  it("fails closed when no secret is configured, rather than authorizing everyone", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(requestWith("Bearer anything"))).toBe(false);
    expect(isAuthorizedCronRequest(requestWith(null))).toBe(false);
  });
});
