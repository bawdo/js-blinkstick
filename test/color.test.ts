import { describe, expect, test } from "vitest";
import { invert, OFF, parseColor, scale, toHex, WHITE } from "../src/color.js";
import { colorNames } from "../src/color-names.js";

describe("parseColor", () => {
  const cases: [string, { r: number; g: number; b: number }][] = [
    ["#ff8800", { r: 255, g: 136, b: 0 }],
    ["#FF8800", { r: 255, g: 136, b: 0 }],
    ["#f80", { r: 255, g: 136, b: 0 }],
    ["#000", OFF],
    ["#ffffff", WHITE],
    ["255,136,0", { r: 255, g: 136, b: 0 }],
    [" 1, 2 ,3 ", { r: 1, g: 2, b: 3 }],
    ["ff8800", { r: 255, g: 136, b: 0 }],
    ["f80", { r: 255, g: 136, b: 0 }],
    [" FFF ", WHITE],
    ["red", { r: 255, g: 0, b: 0 }],
    ["CornflowerBlue", { r: 100, g: 149, b: 237 }],
    [" rebeccapurple ", { r: 102, g: 51, b: 153 }],
    ["grey", { r: 128, g: 128, b: 128 }],
    ["gray", { r: 128, g: 128, b: 128 }],
    ["lightslategrey", { r: 119, g: 136, b: 153 }],
    ["black", OFF],
    ["white", WHITE],
  ];
  test.each(cases)("parses %j", (input, want) => {
    expect(parseColor(input)).toEqual(want);
  });

  test.each([
    "",
    "#",
    "#ff88",
    "#ff88000",
    "#gg0000",
    "ff88",
    "ff88000",
    "gg0000",
    "transparent",
    "currentcolor",
    "notacolour",
    "red ish",
    "#red",
    "1,2",
    "1,2,3,4",
    "256,0,0",
    "-1,0,0",
    "a,b,c",
  ])("rejects %j", (input) => {
    expect(() => parseColor(input)).toThrow(TypeError);
  });

  test("returns frozen colours", () => {
    expect(Object.isFrozen(parseColor("red"))).toBe(true);
    expect(Object.isFrozen(parseColor("#abc"))).toBe(true);
    expect(Object.isFrozen(OFF)).toBe(true);
  });
});

describe("scale", () => {
  test.each([
    [WHITE, 255, WHITE],
    [WHITE, 0, OFF],
    [{ r: 255, g: 128, b: 0 }, 128, { r: 128, g: 64, b: 0 }],
    [{ r: 10, g: 20, b: 30 }, 255, { r: 10, g: 20, b: 30 }],
  ])("scale(%j, %d)", (color, limit, want) => {
    expect(scale(color, limit)).toEqual(want);
  });
});

describe("colorNames", () => {
  test("is frozen, sorted and 148 long", () => {
    expect(Object.isFrozen(colorNames)).toBe(true);
    expect(colorNames).toHaveLength(148);
    expect([...colorNames].sort()).toEqual(colorNames);
  });

  test("has unique lower case names that are not bare hex", () => {
    expect(new Set(colorNames).size).toBe(colorNames.length);
    for (const name of colorNames) {
      expect(name).toBe(name.toLowerCase());
      expect(name).not.toMatch(/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/);
    }
  });

  test("every name parses", () => {
    for (const name of colorNames) {
      expect(() => parseColor(name)).not.toThrow();
    }
  });
});

describe("toHex", () => {
  test.each([
    [OFF, "#000000"],
    [WHITE, "#ffffff"],
    [{ r: 1, g: 0, b: 0 }, "#010000"],
    [{ r: 0, g: 1, b: 0 }, "#000100"],
    [{ r: 0, g: 0, b: 1 }, "#000001"],
    [{ r: 255, g: 136, b: 0 }, "#ff8800"],
    [{ r: 100, g: 149, b: 237 }, "#6495ed"],
  ])("toHex(%j) is %s", (color, want) => {
    expect(toHex(color)).toBe(want);
  });

  test("round trips through parseColor", () => {
    for (const c of [
      OFF,
      WHITE,
      { r: 1, g: 0, b: 0 },
      { r: 12, g: 34, b: 56 },
      { r: 255, g: 136, b: 0 },
    ]) {
      expect(parseColor(toHex(c))).toEqual(c);
    }
  });
});

test("invert flips each channel", () => {
  expect(invert({ r: 0, g: 100, b: 255 })).toEqual({ r: 255, g: 155, b: 0 });
});
