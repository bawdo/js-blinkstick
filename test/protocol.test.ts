import { describe, expect, test } from "vitest";
import {
  decodeFrame,
  encodeFrame,
  encodeLed,
  FRAME_LEDS,
  REPORT_LENGTH,
} from "../src/protocol.js";

test("encodeFrame is channel then GRB, unused slots zero", () => {
  const f = encodeFrame([
    { r: 0x11, g: 0x22, b: 0x33 },
    { r: 0x44, g: 0x55, b: 0x66 },
  ]);
  expect(f).toHaveLength(25);
  expect([...f.slice(0, 7)]).toEqual([
    0x00, 0x22, 0x11, 0x33, 0x55, 0x44, 0x66,
  ]);
  expect(f.slice(7).every((v) => v === 0)).toBe(true);
});

test("encodeLed is channel, index, RGB", () => {
  expect([...encodeLed(3, { r: 0x11, g: 0x22, b: 0x33 })]).toEqual([
    0x00, 0x03, 0x11, 0x22, 0x33,
  ]);
});

test("frame length matches the LED count", () => {
  expect(REPORT_LENGTH[6]).toBe(1 + FRAME_LEDS * 3);
});

describe("decodeFrame round trip", () => {
  for (const n of [8, 2]) {
    test(`n = ${n}`, () => {
      const colors = Array.from({ length: n }, (_, i) => ({
        r: 10 * (i + 1),
        g: i,
        b: 200 - i,
      }));
      expect(decodeFrame(encodeFrame(colors), n)).toEqual(colors);
    });
  }
});

test("decodeFrame returns colours with keys in r, g, b order", () => {
  const [first] = decodeFrame(encodeFrame([{ r: 255, g: 0, b: 0 }]), 1);
  expect(Object.keys(first ?? {})).toEqual(["r", "g", "b"]);
});
