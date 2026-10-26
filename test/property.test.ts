import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseColor, toHex } from "../src/color.js";
import { decodeFrame, encodeFrame, FRAME_LEDS } from "../src/protocol.js";

const byte = fc.integer({ min: 0, max: 255 });
const color = fc.record({ r: byte, g: byte, b: byte });

// Characters that reach every branch of parseColor: hex, decimal, named and
// the separators, plus a few that make each form invalid.
const colorish = fc.string({
  unit: fc.constantFrom(..."0123456789abcdefABCDEFgrnxy#, \t-+.".split("")),
  maxLength: 16,
});

function isByte(v: unknown): boolean {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255;
}

describe("parseColor", () => {
  test("returns byte channels or throws TypeError, for any input", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), colorish), (input) => {
        let c: { r: number; g: number; b: number };
        try {
          c = parseColor(input);
        } catch (e) {
          expect(e).toBeInstanceOf(TypeError);
          return;
        }
        expect(Object.keys(c).sort()).toEqual(["b", "g", "r"]);
        expect([c.r, c.g, c.b].every(isByte)).toBe(true);
      }),
    );
  });

  test("reads back what toHex writes", () => {
    fc.assert(
      fc.property(color, (c) => {
        expect(parseColor(toHex(c))).toEqual(c);
      }),
    );
  });

  test("reads back r,g,b", () => {
    fc.assert(
      fc.property(color, (c) => {
        expect(parseColor(`${c.r},${c.g},${c.b}`)).toEqual(c);
      }),
    );
  });
});

describe("frames", () => {
  test("decodeFrame reads back what encodeFrame writes", () => {
    fc.assert(
      fc.property(fc.array(color, { maxLength: FRAME_LEDS }), (cs) => {
        expect(decodeFrame(encodeFrame(cs), cs.length)).toEqual(cs);
      }),
    );
  });

  test("decodeFrame gives count byte colours for any device data", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 64 }),
        fc.integer({ min: 0, max: FRAME_LEDS * 2 }),
        (data, count) => {
          const cs = decodeFrame(data, count);
          expect(cs).toHaveLength(count);
          expect(cs.every((c) => [c.r, c.g, c.b].every(isByte))).toBe(true);
        },
      ),
    );
  });
});
