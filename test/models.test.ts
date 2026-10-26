import { describe, expect, test } from "vitest";
import {
  byteToMode,
  detectFromDescriptor,
  detectFromSerial,
  ledCount,
  type Mode,
  type Model,
  modeToByte,
  supportsMode,
} from "../src/models.js";

describe("detectFromSerial", () => {
  const cases: [string, string, number, Model][] = [
    ["nano", "BS072777-3.0", 0x0202, "nano"],
    ["square", "BS073788-3.1", 0x0201, "square"],
    ["pro", "BS000001-2.0", 0x0200, "unknown"],
    ["v2 with square release", "BS000001-2.0", 0x0201, "unknown"],
    ["flex", "BS000002-3.0", 0x0203, "unknown"],
    ["v1 with square release", "BS000003-1.0", 0x0201, "unknown"],
    ["garbage serial", "garbage", 0x0202, "unknown"],
  ];
  for (const [name, serial, release, want] of cases) {
    test(name, () => expect(detectFromSerial(serial, release)).toBe(want));
  }
});

test("detectFromDescriptor", () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  expect(detectFromDescriptor("BlinkStick Nano", ids)).toBe("nano");
  expect(detectFromDescriptor("BlinkStick", [...ids, 10])).toBe("square");
  expect(detectFromDescriptor("BlinkStick", ids)).toBe("unknown");
});

test("ledCount", () => {
  expect(ledCount("nano")).toBe(2);
  expect(ledCount("square")).toBe(8);
  expect(ledCount("unknown")).toBe(0);
});

test("supportsMode allows only modes 2 and 3, on nano and square", () => {
  for (const m of ["nano", "square"] as const) {
    expect(supportsMode(m, "ws2812")).toBe(true);
    expect(supportsMode(m, "ws2812-mirror")).toBe(true);
    expect(supportsMode(m, "rgb")).toBe(false);
    expect(supportsMode(m, "rgb-inverse")).toBe(false);
  }
  for (const x of ["rgb", "rgb-inverse", "ws2812", "ws2812-mirror"] as Mode[]) {
    expect(supportsMode("unknown", x)).toBe(false);
  }
});

test("mode names map to bytes 0 to 3", () => {
  const names: Mode[] = ["rgb", "rgb-inverse", "ws2812", "ws2812-mirror"];
  names.forEach((name, i) => {
    expect(modeToByte(name)).toBe(i);
    expect(byteToMode(i)).toBe(name);
  });
  expect(byteToMode(7)).toBe(7);
});
