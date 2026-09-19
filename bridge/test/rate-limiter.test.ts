import { describe, expect, it } from "vitest";
import { BridgeError } from "../src/errors.js";
import { FixedWindowRateLimiter } from "../src/services/rate-limiter.js";

describe("fixed-window rate limiter", () => {
  it("limits a key and resets after the window", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    limiter.consume("device:a", 1000);
    limiter.consume("device:a", 1100);

    try {
      limiter.consume("device:a", 1200);
      throw new Error("expected limiter to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(BridgeError);
      expect(error).toMatchObject({
        statusCode: 429,
        code: "RATE_LIMITED",
        details: { retryAfterSeconds: 1 },
      });
    }

    expect(() => limiter.consume("device:b", 1200)).not.toThrow();
    expect(() => limiter.consume("device:a", 2000)).not.toThrow();
  });

  it("can discard expired buckets", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    limiter.consume("ip:1", 0);
    limiter.cleanup(1000);
    expect(() => limiter.consume("ip:1", 1000)).not.toThrow();
  });
});
