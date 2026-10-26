import { describe, expect, test } from "vitest";
import { hue, randomColor, randomVividColor } from "../src/random.js";

const key = (c: { r: number; g: number; b: number }): string =>
  `${c.r},${c.g},${c.b}`;

test("randomColor varies", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(key(randomColor()));
  expect(seen.size).toBeGreaterThanOrEqual(90);
});

test("randomVividColor is fully saturated", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const c = randomVividColor();
    seen.add(key(c));
    expect(Math.max(c.r, c.g, c.b)).toBe(255);
    expect(Math.min(c.r, c.g, c.b)).toBe(0);
  }
  expect(seen.size).toBeGreaterThanOrEqual(500);
});

describe("hue", () => {
  test.each([
    [0, { r: 255, g: 0, b: 0 }],
    [128, { r: 255, g: 128, b: 0 }],
    [255, { r: 255, g: 255, b: 0 }],
    [510, { r: 0, g: 255, b: 0 }],
    [765, { r: 0, g: 255, b: 255 }],
    [1020, { r: 0, g: 0, b: 255 }],
    [1275, { r: 255, g: 0, b: 255 }],
    [1529, { r: 255, g: 0, b: 1 }],
  ])("hue(%d)", (step, want) => {
    expect(hue(step)).toEqual(want);
  });
});
