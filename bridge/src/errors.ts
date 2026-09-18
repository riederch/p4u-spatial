export class BridgeError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export function assertOrThrow(
  condition: unknown,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) throw new BridgeError(statusCode, code, message, details);
}
