export type SignupRateLimitResult = {
  allowed: boolean;
  reason?: "ip" | "email";
  retryAfterSeconds?: number;
};

type SignupRateLimiterOptions = {
  ipLimit: number;
  emailLimit: number;
  windowMs: number;
  maxKeys?: number;
};

/**
 * Process-local signup abuse guard. Entries are bounded and periodically
 * swept, so rotating IP/email values cannot turn the limiter into a memory
 * exhaustion primitive.
 */
export class SignupRateLimiter {
  private readonly ipAttempts = new Map<string, number[]>();
  private readonly emailAttempts = new Map<string, number[]>();
  private lastSweepAt = 0;

  constructor(private readonly options: SignupRateLimiterOptions) {}

  check(ip: string, email: string, now = Date.now()): SignupRateLimitResult {
    this.sweepIfDue(now);
    const normalizedEmail = email.trim().toLowerCase();
    const ipTimestamps = this.activeAttempts(this.ipAttempts, ip, now);
    if (ipTimestamps.length >= this.options.ipLimit) {
      return this.blocked("ip", ipTimestamps[0], now);
    }

    const emailTimestamps = this.activeAttempts(this.emailAttempts, normalizedEmail, now);
    if (emailTimestamps.length >= this.options.emailLimit) {
      return this.blocked("email", emailTimestamps[0], now);
    }

    this.makeRoom(this.ipAttempts, ip);
    this.makeRoom(this.emailAttempts, normalizedEmail);
    ipTimestamps.push(now);
    emailTimestamps.push(now);
    this.ipAttempts.set(ip, ipTimestamps);
    this.emailAttempts.set(normalizedEmail, emailTimestamps);
    return { allowed: true };
  }

  stats() {
    return { ipKeys: this.ipAttempts.size, emailKeys: this.emailAttempts.size };
  }

  private activeAttempts(store: Map<string, number[]>, key: string, now: number) {
    const cutoff = now - this.options.windowMs;
    const timestamps = (store.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (timestamps.length === 0) store.delete(key);
    else store.set(key, timestamps);
    return timestamps;
  }

  private sweepIfDue(now: number) {
    if (now - this.lastSweepAt < this.options.windowMs) return;
    this.lastSweepAt = now;
    for (const store of [this.ipAttempts, this.emailAttempts]) {
      for (const [key, timestamps] of store) {
        const active = timestamps.filter((timestamp) => timestamp > now - this.options.windowMs);
        if (active.length === 0) store.delete(key);
        else store.set(key, active);
      }
    }
  }

  private makeRoom(store: Map<string, number[]>, key: string) {
    const maxKeys = this.options.maxKeys ?? 4096;
    if (store.has(key) || store.size < maxKeys) return;

    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [candidate, timestamps] of store) {
      const timestamp = timestamps.at(-1) ?? 0;
      if (timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
        oldestKey = candidate;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  private blocked(reason: "ip" | "email", earliest: number, now: number): SignupRateLimitResult {
    return {
      allowed: false,
      reason,
      retryAfterSeconds: Math.max(1, Math.ceil((earliest + this.options.windowMs - now) / 1000)),
    };
  }
}

// Conservative for a self-hosted application: five attempts per IP and three
// per email every 15 minutes. Supabase's own Auth limits remain a second line.
export const signupRateLimiter = new SignupRateLimiter({
  ipLimit: 5,
  emailLimit: 3,
  windowMs: 15 * 60 * 1000,
});
