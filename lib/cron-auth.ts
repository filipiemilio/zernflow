import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Authorizes a cron invocation from the Authorization header.
 *
 * The secret is compared in constant time: `===` returns as soon as two bytes
 * differ, so response latency leaks how much of a guess was correct. Header
 * -only auth (never a query string) also keeps the secret out of reverse-proxy
 * access logs and monitoring traces.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so lengths are compared
  // first; that reveals only the secret's length, never its contents.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
