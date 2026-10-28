import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BlinkStick, type BlinkStickInfo } from "../src/blinkstick.js";
import type { Color } from "../src/color.js";
import { openStick } from "../src/discovery.js";
import { BlinkStickError } from "../src/errors.js";
import type { Model } from "../src/models.js";
import { nanoInfo, threeSticks } from "./fakes/fake-backend.js";
import { serialPlatform } from "./fakes/fake-platform.js";
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

/** The window a Nano or Square refused transfers for after a mode write. */
const BUSY_MS = 15;

/**
 * Settles `p` after running fake timers well past the 250 ms limit, so a
 * rejection is caught before it can go unhandled.
 */
async function drain<T>(p: Promise<T>): Promise<T> {
  const held = p.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(1000);
  const result = await held;
  if ("error" in result) throw result.error;
  return result.value;
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

  test("modeReadError", async () => {
    // Go's TestModeReadError: every attempt fails, so the I/O error surfaces.
    const { stick, ft } = open("square");
    ft.fail = 3;
    await expect(stick.getMode()).rejects.toThrow(/get report 4/);
    ft.fail = 3;
    await expect(stick.setMode("ws2812-mirror")).rejects.toThrow(
      /get report 4/,
    );
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
    // The read before the write, the read back after it, then getMode.
    expect(ft.gets).toBe(3);
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

describe("modes on a stick that is busy after a mode write", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("getMode straight after setMode", async () => {
    const { stick, ft } = open("nano");
    ft.busyAfterModeMs = BUSY_MS;
    const set = drain(stick.setMode("ws2812-mirror"));
    const get = drain(stick.getMode());
    await set;
    expect(await get).toBe("ws2812-mirror");
  });

  test("setInfoBlock straight after setMode", async () => {
    const { stick, ft } = open("square");
    ft.busyAfterModeMs = BUSY_MS;
    const set = drain(stick.setMode("ws2812-mirror"));
    const write = drain(stick.setInfoBlock(2, Uint8Array.of(1, 2, 3)));
    await set;
    await write;
    expect([...(await drain(stick.getInfoBlock(2)))]).toEqual([1, 2, 3]);
  });

  test("setName straight after setMode", async () => {
    const { stick, ft } = open("nano");
    ft.busyAfterModeMs = BUSY_MS;
    const set = drain(stick.setMode("ws2812-mirror"));
    const name = drain(stick.setName("desk"));
    await set;
    await name;
    expect(await drain(stick.getName())).toBe("desk");
  });

  test("setMode resolves only once the stick answers again", async () => {
    const { stick, ft } = open("nano");
    ft.busyAfterModeMs = BUSY_MS;
    let done = false;
    const set = stick.setMode("ws2812-mirror").then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(BUSY_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(BUSY_MS);
    await set;
    expect(done).toBe(true);
  });

  test("waiting does not reconnect", async () => {
    const { backend, transports } = threeSticks();
    const stick = await openStick(serialPlatform(backend), {
      match: (i) => i.serial === nanoInfo.serial,
    });
    transports.nano.busyAfterModeMs = BUSY_MS;
    const opened = backend.opened.length;
    const set = drain(stick.setMode("ws2812-mirror"));
    const get = drain(stick.getMode());
    await set;
    expect(await get).toBe("ws2812-mirror");
    expect(backend.opened.length).toBe(opened);
  });

  test("gives up after 250 ms with DISCONNECTED naming the stick", async () => {
    const ft = new FakeTransport();
    ft.busyAfterModeMs = Number.POSITIVE_INFINITY;
    const stick = new BlinkStick({
      transport: ft,
      info: {
        model: "nano",
        product: "BlinkStick Nano",
        manufacturer: "Agile Innovative Ltd",
        serial: "BS072777-3.0",
      },
    });
    let settled = false;
    const set = stick.setMode("ws2812-mirror").then(
      () => {
        settled = true;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await vi.advanceTimersByTimeAsync(240);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(settled).toBe(true);
    const error = await set;
    expect(error).toBeInstanceOf(BlinkStickError);
    expect(error).toMatchObject({ code: "DISCONNECTED" });
    expect((error as Error).message).toContain("BS072777-3.0");
  });
});
