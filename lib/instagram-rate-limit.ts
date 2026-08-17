export type InstagramOutboundKind =
  | "private_reply"
  | "direct_message"
  | "public_reply";

const LIMITS: Record<InstagramOutboundKind, { max: number; windowMs: number }> = {
  // Keep headroom below Zernio/Meta's documented 600 private replies/hour.
  private_reply: { max: 550, windowMs: 60 * 60 * 1000 },
  // Conservative burst guard; platform limits can vary by account and endpoint.
  direct_message: { max: 10, windowMs: 1000 },
  public_reply: { max: 60, windowMs: 60 * 1000 },
};

export function createInstagramRateLimiter() {
  const events = new Map<string, number[]>();

  return {
    reserve(
      accountId: string,
      kind: InstagramOutboundKind,
      now = Date.now(),
    ): boolean {
      if (!accountId) return false;
      const { max, windowMs } = LIMITS[kind];
      const key = `${accountId}:${kind}`;
      const cutoff = now - windowMs;
      const recent = (events.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= max) {
        events.set(key, recent);
        return false;
      }
      recent.push(now);
      events.set(key, recent);
      return true;
    },
  };
}

// The production app runs as one systemd Node process. This protects burst and
// rolling-hour limits in-process; upstream 429 handling remains authoritative.
export const instagramOutboundRateLimiter = createInstagramRateLimiter();
