import type { Color } from "./color.js";

function describe(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function isByte(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

/**
 * Throws a TypeError unless `c` is an object with numeric r, g and b, and a
 * RangeError unless each channel is an integer from 0 to 255.
 */
export function assertColor(c: unknown): asserts c is Color {
  if (typeof c !== "object" || c === null) {
    throw new TypeError(`blinkstick: expected a colour, got ${describe(c)}`);
  }
  for (const channel of ["r", "g", "b"] as const) {
    const v: unknown = (c as Record<string, unknown>)[channel];
    if (typeof v !== "number") {
      throw new TypeError(
        `blinkstick: colour channel ${channel} is not a number`,
      );
    }
    if (!isByte(v)) {
      throw new RangeError(
        `blinkstick: colour channel ${channel} must be an integer from 0 to 255, got ${v}`,
      );
    }
  }
}

/**
 * Throws a TypeError unless `i` is a number, and a RangeError unless it is an
 * integer from 0 up to but not including `count`.
 */
export function assertIndex(i: unknown, count: number): asserts i is number {
  if (typeof i !== "number") {
    throw new TypeError(
      `blinkstick: LED index must be a number, got ${describe(i)}`,
    );
  }
  if (!Number.isInteger(i) || i < 0 || i >= count) {
    throw new RangeError(
      `blinkstick: LED index ${i} is out of range, this stick has ${count}`,
    );
  }
}

/** Throws a TypeError unless `n` is a number, and a RangeError unless it is an integer from 0 to 255. */
export function assertByte(n: unknown, label: string): asserts n is number {
  if (typeof n !== "number") {
    throw new TypeError(
      `blinkstick: ${label} must be a number, got ${describe(n)}`,
    );
  }
  if (!isByte(n)) {
    throw new RangeError(
      `blinkstick: ${label} must be an integer from 0 to 255, got ${n}`,
    );
  }
}
