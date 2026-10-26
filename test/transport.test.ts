import { describe, expect, test } from "vitest";
import { BlinkStickError } from "../src/errors.js";
import { stripReportId } from "../src/transport.js";

describe("stripReportId", () => {
  test("drops a leading report ID when the length is one more", () => {
    const out = stripReportId(5, 2, Uint8Array.of(5, 9, 8));
    expect([...out]).toEqual([9, 8]);
  });

  test("returns bytes unchanged when the length already matches", () => {
    const bytes = Uint8Array.of(9, 8);
    expect(stripReportId(5, 2, bytes)).toBe(bytes);
  });

  test("returns exactly length bytes after the ID, ignoring trailing bytes", () => {
    // Chrome on macOS: report 2 comes back as ID plus 33 bytes, not 32.
    const bytes = new Uint8Array(34);
    bytes[0] = 2;
    bytes.set(new TextEncoder().encode("nano"), 1);
    const out = stripReportId(2, 32, bytes);
    expect(out).toHaveLength(32);
    expect([...out.subarray(0, 4)]).toEqual([0x6e, 0x61, 0x6e, 0x6f]);
    expect([...out.subarray(4)].every((b) => b === 0)).toBe(true);
  });

  test("treats exactly length bytes as no ID even if byte 0 equals it", () => {
    const bytes = Uint8Array.of(5, 9);
    expect(stripReportId(5, 2, bytes)).toBe(bytes);
  });

  test("throws when longer than length with a first byte that is not the ID", () => {
    expect(() => stripReportId(2, 32, new Uint8Array(34))).toThrow(/report 2/);
  });

  test("throws when shorter than length", () => {
    expect(() => stripReportId(5, 2, Uint8Array.of(9))).toThrow(
      /report 5.*2.*1/,
    );
  });

  test("throws naming the ID, expected and actual lengths", () => {
    expect(() => stripReportId(5, 2, Uint8Array.of(1, 2, 3, 4))).toThrow(
      /report 5.*2.*4/,
    );
    expect(() => stripReportId(5, 2, Uint8Array.of(7, 9, 8))).toThrow(
      /report 5/,
    );
  });
});

describe("BlinkStickError", () => {
  test("is an Error with a name and code", () => {
    const e = new BlinkStickError("CLOSED", "gone");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("BlinkStickError");
    expect(e.code).toBe("CLOSED");
    expect(e.message).toBe("gone");
  });

  test("preserves the cause", () => {
    const cause = new Error("root");
    const e = new BlinkStickError("DISCONNECTED", "lost", { cause });
    expect(e.cause).toBe(cause);
  });
});
