import { describe, expect, test } from "vitest";
import { BlinkStick, type BlinkStickInfo } from "../src/blinkstick.js";
import type { Color } from "../src/color.js";
import { BlinkStickError } from "../src/errors.js";
import type { Model } from "../src/models.js";
import { FakeTransport } from "./fakes/fake-transport.js";

function open(model: Model): { stick: BlinkStick; ft: FakeTransport } {
  const ft = new FakeTransport();
  const info: BlinkStickInfo = {
    model,
    product: "BlinkStick",
    manufacturer: "Agile Innovative Ltd",
  };
  return { stick: new BlinkStick({ transport: ft, info }), ft };
}

describe("modes", () => {
  test("getModeReadsReport4", async () => {
    const { stick, ft } = open("nano");
    expect(await stick.getMode()).toBe("ws2812");
    ft.reports.set(4, Uint8Array.of(3));
    expect(await stick.getMode()).toBe("ws2812-mirror");
    ft.reports.set(4, Uint8Array.of(9));
    expect(await stick.getMode()).toBe(9);
  });

  test("setModeWritesReport4", async () => {
    const { stick, ft } = open("square");
    await stick.setMode("ws2812-mirror");
    expect(ft.sends.at(-1)).toEqual({ id: 4, data: Uint8Array.of(3) });
    expect(await stick.getMode()).toBe("ws2812-mirror");
    await stick.setMode("ws2812");
    expect(ft.sends.at(-1)).toEqual({ id: 4, data: Uint8Array.of(2) });
  });

  test("sameModeSkipsWrite", async () => {
    const { stick, ft } = open("nano");
    await stick.setMode("ws2812");
    expect(ft.sendCount()).toBe(0);
  });

  test("rejectsUnsupportedModes", async () => {
    for (const model of ["nano", "square", "unknown"] as const) {
      for (const mode of ["rgb", "rgb-inverse"] as const) {
        const { stick, ft } = open(model);
        await expect(stick.setMode(mode)).rejects.toMatchObject({
          constructor: BlinkStickError,
          code: "UNSUPPORTED_MODE",
        });
        expect(ft.sendCount()).toBe(0);
        expect(ft.gets).toBe(0);
      }
    }
    const { stick, ft } = open("unknown");
    await expect(stick.setMode("ws2812")).rejects.toMatchObject({
      code: "UNSUPPORTED_MODE",
    });
    expect(ft.sendCount() + ft.gets).toBe(0);
  });

  test("rejectsNonModesWithTypeError", async () => {
    const { stick, ft } = open("nano");
    for (const bad of ["bogus", 2, undefined, null, "WS2812"]) {
      await expect(stick.setMode(bad as never)).rejects.toThrow(TypeError);
    }
    expect(ft.sendCount() + ft.gets).toBe(0);
  });

  test("readAndWriteShareOneQueuedTask", async () => {
    const { stick, ft } = open("nano");
    const a = stick.setMode("ws2812-mirror");
    const b = stick.getMode();
    await a;
    expect(await b).toBe("ws2812-mirror");
    expect(ft.gets).toBe(2);
  });

  test("ledMethodsInMirrorMode", async () => {
    const { stick } = open("square");
    await stick.setMode("ws2812-mirror");
    const palette: Color[] = Array.from({ length: 8 }, (_, i) => ({
      r: 10 * (i + 1),
      g: i,
      b: 200 - i,
    }));
    await stick.setFrame(palette);
    await stick.setLed(1, { r: 1, g: 0, b: 0 });
    const want = palette.map((c) => ({ ...c }));
    want[1] = { r: 1, g: 0, b: 0 };
    expect(await stick.getFrame()).toEqual(want);
  });
});
