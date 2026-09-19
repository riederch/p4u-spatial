import { BridgeError } from "../errors.js";

interface Bucket {
  windowStartedAt: number;
  count: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, nowMs = Date.now()): void {
    const existing = this.buckets.get(key);
    if (!existing || nowMs - existing.windowStartedAt >= this.windowMs) {
      this.buckets.set(key, { windowStartedAt: nowMs, count: 1 });
      return;
    }

    if (existing.count >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.windowStartedAt + this.windowMs - nowMs) / 1000));
      throw new BridgeError(
        429,
        "RATE_LIMITED",
        "Too many requests. Retry later.",
        { retryAfterSeconds },
      );
    }

    existing.count += 1;
  }

  cleanup(nowMs = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.windowStartedAt >= this.windowMs) this.buckets.delete(key);
    }
  }
}
