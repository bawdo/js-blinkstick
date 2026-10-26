/**
 * The stable codes on a BlinkStickError:
 *
 * - NOT_FOUND: no matching stick, or an empty serial or name
 * - UNSUPPORTED_MODEL: an unknown model, or a `model` hint that disagrees with detection
 * - UNSUPPORTED_MODE: `setMode` with a mode the model forbids
 * - CLOSED: a call on a stick after `close()`
 * - DUPLICATE_NAME: two sticks share the name passed to `open`
 * - DISCONNECTED: the stick went away and could not be reopened
 */
export type BlinkStickErrorCode =
  | "NOT_FOUND"
  | "UNSUPPORTED_MODEL"
  | "UNSUPPORTED_MODE"
  | "CLOSED"
  | "DUPLICATE_NAME"
  | "DISCONNECTED";

/**
 * An operational failure with a stable `code`, for the cases listed on
 * BlinkStickErrorCode. Not every failure is one. These are plain errors: a
 * transfer that still fails after its retries and any reopen, a received
 * report of the wrong length, and a missing platform (no WebHID in the
 * browser, no HID package in Node).
 * Programmer mistakes throw TypeError or RangeError.
 */
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
