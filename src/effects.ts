import type { Color } from "./color.js";

/** Time between frames in an effect. */
export const STEP_MS = 20;

/** Default `period` and `duration`, in milliseconds. */
export const DEFAULT_MS = 1000;

export interface BlinkOptions {
  /** Milliseconds for one on and off cycle. Finite and above 0. Default 1000. */
  period?: number;
  /** How many cycles to run, an integer of at least 1. Default 1. */
  iterations?: number;
  /** Cancels the effect, leaving the LEDs as they are. */
  signal?: AbortSignal;
}

export interface PulseOptions {
  /** Milliseconds for one fade up and down. Finite and above 0. Default 1000. */
  duration?: number;
  /** How many pulses to run, an integer of at least 1. Default 1. */
  iterations?: number;
  /** Cancels the effect, leaving the LEDs as they are. */
  signal?: AbortSignal;
}

export interface MorphOptions {
  /** Milliseconds to fade over. Finite and at least 0. Default 1000. */
  duration?: number;
  /** Cancels the effect, leaving the LEDs as they are. */
  signal?: AbortSignal;
}

/**
 * Waits `ms`, or rejects with `signal.reason` as soon as the signal aborts.
 * Leaves no timer scheduled and no listener attached once it settles.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The point `step / steps` of the way from `a` to `b`, in integer arithmetic. */
export function lerp(a: Color, b: Color, step: number, steps: number): Color {
  const f = (x: number, y: number): number =>
    x + Math.trunc(((y - x) * step) / steps);
  return { r: f(a.r, b.r), g: f(a.g, b.g), b: f(a.b, b.b) };
}

/** Validates a millisecond option: finite, and above 0 unless `allowZero`. */
export function checkMs(
  value: number | undefined,
  label: string,
  allowZero: boolean,
): number {
  if (value === undefined) return DEFAULT_MS;
  if (typeof value !== "number") {
    throw new TypeError(`blinkstick: ${label} must be a number`);
  }
  if (!Number.isFinite(value) || value < 0 || (value === 0 && !allowZero)) {
    throw new RangeError(
      `blinkstick: ${label} must be a finite number ${allowZero ? "of at least 0" : "above 0"}, got ${value}`,
    );
  }
  return value;
}

/** Validates `iterations`: an integer of at least 1. */
export function checkIterations(value: number | undefined): number {
  if (value === undefined) return 1;
  if (typeof value !== "number") {
    throw new TypeError("blinkstick: iterations must be a number");
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `blinkstick: iterations must be an integer of at least 1, got ${value}`,
    );
  }
  return value;
}
