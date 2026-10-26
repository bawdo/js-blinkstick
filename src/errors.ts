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
