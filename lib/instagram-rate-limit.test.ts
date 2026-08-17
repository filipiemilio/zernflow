import { describe, expect, it } from "vitest";
import { createInstagramRateLimiter } from "./instagram-rate-limit";

describe("Instagram outbound rate limiter", () => {
  it("keeps private replies below the documented hourly ceiling", () => {
    const limiter = createInstagramRateLimiter();
    const now = Date.parse("2026-08-04T00:00:00Z");
    for (let index = 0; index < 550; index++) {
      expect(limiter.reserve("account", "private_reply", now)).toBe(true);
    }
    expect(limiter.reserve("account", "private_reply", now)).toBe(false);
    expect(limiter.reserve("account", "private_reply", now + 60 * 60 * 1000 + 1)).toBe(true);
  });

  it("isolates accounts and limits short direct-message bursts", () => {
    const limiter = createInstagramRateLimiter();
    const now = Date.parse("2026-08-04T00:00:00Z");
    for (let index = 0; index < 10; index++) {
      expect(limiter.reserve("a", "direct_message", now)).toBe(true);
    }
    expect(limiter.reserve("a", "direct_message", now)).toBe(false);
    expect(limiter.reserve("b", "direct_message", now)).toBe(true);
    expect(limiter.reserve("a", "direct_message", now + 1001)).toBe(true);
  });
});
