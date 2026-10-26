export type BlinkStickErrorCode =
  | "NOT_FOUND"
  | "UNSUPPORTED_MODEL"
  | "UNSUPPORTED_MODE"
  | "CLOSED"
  | "DUPLICATE_NAME"
  | "DISCONNECTED";

/** Every failure the library raises on purpose carries a stable `code`. */
export class BlinkStickError extends Error {
  readonly code: BlinkStickErrorCode;

  constructor(
    code: BlinkStickErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BlinkStickError";
    this.code = code;
  }
}
