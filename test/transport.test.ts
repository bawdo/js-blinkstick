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
