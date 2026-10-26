import type { Color } from "./color.js";

/** USB identifiers shared by every BlinkStick model. */
export const VENDOR_ID = 0x20a0;
export const PRODUCT_ID = 0x41e5;

/** Feature report IDs. */
export const REPORT = {
  led0: 1,
  info1: 2,
  info2: 3,
  mode: 4,
  led: 5,
  frame: 6,
} as const;

/** Data bytes per report, without the leading report ID. */
export const REPORT_LENGTH = {
  1: 3,
  2: 32,
  3: 32,
  4: 1,
  5: 5,
  6: 25,
} as const;

/** LEDs carried by one frame report. */
export const FRAME_LEDS = 8;

/**
 * Builds the data for report 6 on channel 0. The device expects each LED as
 * G, R, B. Slots beyond `colors.length` are zero. Colours must already be
 * validated, and there must be no more than FRAME_LEDS of them.
 */
export function encodeFrame(colors: readonly Color[]): Uint8Array {
  const data = new Uint8Array(REPORT_LENGTH[6]);
  colors.forEach((c, i) => {
    data[1 + i * 3] = c.g;
    data[2 + i * 3] = c.r;
    data[3 + i * 3] = c.b;
  });
  return data;
}

/** Reads the first `count` LEDs out of report 6 data. */
export function decodeFrame(data: Uint8Array, count: number): Color[] {
  return Array.from({ length: count }, (_, i) => ({
    r: data[2 + i * 3] ?? 0,
    g: data[1 + i * 3] ?? 0,
    b: data[3 + i * 3] ?? 0,
  }));
}

/**
 * Builds the data for report 5, which sets one LED. Unlike the frame, it takes
 * R, G, B in that order. The firmware ignores the channel byte, so it is
 * always 0, and does not range check the index, so callers must.
 */
export function encodeLed(index: number, color: Color): Uint8Array {
  return Uint8Array.of(0, index, color.r, color.g, color.b);
}
