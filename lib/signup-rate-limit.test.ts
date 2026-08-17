import { describe, expect, it } from "vitest";
import { SignupRateLimiter } from "./signup-rate-limit";

describe("SignupRateLimiter", () => {
  it("allows a bounded number of signup attempts per IP in its time window", () => {
    const limiter = new SignupRateLimiter({ ipLimit: 2, emailLimit: 10, windowMs: 60_000 });

    expect(limiter.check("198.51.100.42", "one@example.com", 0).allowed).toBe(true);
    expect(limiter.check("198.51.100.42", "two@example.com", 1).allowed).toBe(true);

    const blocked = limiter.check("198.51.100.42", "three@example.com", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("ip");
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("limits repeated attempts against the same email across IP addresses", () => {
    const limiter = new SignupRateLimiter({ ipLimit: 10, emailLimit: 2, windowMs: 60_000 });

    expect(limiter.check("198.51.100.1", "person@example.com", 0).allowed).toBe(true);
    expect(limiter.check("198.51.100.2", "person@example.com", 1).allowed).toBe(true);

    const blocked = limiter.check("198.51.100.3", "person@example.com", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("email");
  });

  it("sweeps expired keys and bounds memory when attackers rotate identities", () => {
    const limiter = new SignupRateLimiter({
      ipLimit: 10,
      emailLimit: 10,
      windowMs: 60_000,
      maxKeys: 2,
    });

    limiter.check("198.51.100.1", "one@example.com", 0);
    limiter.check("198.51.100.2", "two@example.com", 1);
    limiter.check("198.51.100.3", "three@example.com", 2);
    expect(limiter.stats()).toEqual({ ipKeys: 2, emailKeys: 2 });

    limiter.check("198.51.100.4", "four@example.com", 60_003);
    expect(limiter.stats()).toEqual({ ipKeys: 1, emailKeys: 1 });
  });
});
