import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BlinkStick, type BlinkStickInfo } from "../src/blinkstick.js";
import type { Color } from "../src/color.js";
import { OFF, WHITE } from "../src/color.js";
import { lerp, sleep } from "../src/effects.js";
import type { Model } from "../src/models.js";
import { FakeTransport } from "./fakes/fake-transport.js";

function fill(n: number, c: Color): Color[] {
  return Array.from({ length: n }, () => ({ ...c }));
}

function open(model: Model): { stick: BlinkStick; ft: FakeTransport } {
  const ft = new FakeTransport();
  const info: BlinkStickInfo = {
    model,
    product: "BlinkStick",
    manufacturer: "Agile Innovative Ltd",
  };
  return { stick: new BlinkStick({ transport: ft, info }), ft };
}

/** Delays passed to setTimeout while the fake clock is in force. */
function recordDelays(): number[] {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: () => void,
    ms?: number,
  ) => {
    delays.push(ms ?? 0);
    return real(fn, ms);
  }) as typeof setTimeout);
  return delays;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("effects", () => {
  test("blink", async () => {
    const { stick, ft } = open("square");
    const delays = recordDelays();
    const run = stick.blink(WHITE, { period: 200, iterations: 2 });
    await vi.runAllTimersAsync();
    await run;
    expect(ft.sentFrames(8)).toEqual([
      fill(8, WHITE),
      fill(8, OFF),
      fill(8, WHITE),
      fill(8, OFF),
    ]);
    expect(delays).toEqual([100, 100, 100, 100]);
  });

  test("blink defaults to one 1000 ms cycle", async () => {
    const { stick, ft } = open("nano");
    const run = stick.blink(WHITE);
    await vi.advanceTimersByTimeAsync(499);
    expect(ft.sentFrames(2)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ft.sentFrames(2)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(500);
    await run;
  });

  test("morph", async () => {
    const { stick, ft } = open("nano");
    const delays = recordDelays();
    const to = { r: 100, g: 200, b: 0 };
    const run = stick.morph(to, { duration: 100 });
    await vi.runAllTimersAsync();
    await run;
    const frames = ft.sentFrames(2);
    expect(frames).toHaveLength(5);
    expect(frames[0]?.[0]).toEqual({ r: 20, g: 40, b: 0 });
    expect(frames[4]).toEqual(fill(2, to));
    expect(delays).toEqual([20, 20, 20, 20]);
  });

  test("morph starts from the frame read off the stick", async () => {
    const { stick, ft } = open("nano");
    await stick.setFrame([
      { r: 200, g: 0, b: 0 },
      { r: 0, g: 0, b: 100 },
    ]);
    const run = stick.morph(OFF, { duration: 40 });
    await vi.runAllTimersAsync();
    await run;
    const frames = ft.sentFrames(2);
    expect(frames[1]).toEqual([
      { r: 100, g: 0, b: 0 },
      { r: 0, g: 0, b: 50 },
    ]);
    expect(ft.frame(2)).toEqual(fill(2, OFF));
  });

  test("morph with zero duration jumps", async () => {
    const { stick, ft } = open("nano");
    await stick.morph(WHITE, { duration: 0 });
    expect(ft.sentFrames(2)).toEqual([fill(2, WHITE)]);
  });

  test("morph honours the brightness limit", async () => {
    const { stick, ft } = open("nano");
    stick.brightnessLimit = 128;
    await stick.morph(WHITE, { duration: 0 });
    expect(ft.frame(2)).toEqual(fill(2, { r: 128, g: 128, b: 128 }));
  });

  test("morph on an inverted stick", async () => {
    const { stick, ft } = open("nano");
    stick.inverted = true;
    await stick.off();
    const to = { r: 100, g: 200, b: 0 };
    const run = stick.morph(to, { duration: 100 });
    await vi.runAllTimersAsync();
    await run;
    const frames = ft.sentFrames(2);
    expect(frames[1]?.[0]).toEqual({ r: 235, g: 215, b: 255 });
    expect(ft.frame(2)).toEqual(fill(2, { r: 155, g: 55, b: 255 }));
  });

  test("pulse", async () => {
    const { stick, ft } = open("nano");
    const c = { r: 0, g: 200, b: 0 };
    const run = stick.pulse(c, { duration: 80 });
    await vi.runAllTimersAsync();
    await run;
    const frames = ft.sentFrames(2);
    expect(frames).toHaveLength(5);
    expect(frames[0]).toEqual(fill(2, OFF));
    expect(frames[2]).toEqual(fill(2, c));
    expect(frames[4]).toEqual(fill(2, OFF));
  });

  test("two effects started together interleave frame by frame", async () => {
    const { stick, ft } = open("nano");
    const a = stick.morph({ r: 100, g: 0, b: 0 }, { duration: 40 });
    const b = stick.morph({ r: 0, g: 0, b: 100 }, { duration: 40 });
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(ft.sentFrames(2)).toEqual([
      fill(2, { r: 50, g: 0, b: 0 }),
      fill(2, { r: 0, g: 0, b: 50 }),
      fill(2, { r: 100, g: 0, b: 0 }),
      fill(2, { r: 0, g: 0, b: 100 }),
    ]);
  });
});

describe("cancellation", () => {
  test("an already cancelled signal rejects every effect and sends nothing", async () => {
    const { stick, ft } = open("nano");
    const signal = AbortSignal.abort();
    for (const run of [
      stick.blink(WHITE, { signal }),
      stick.pulse(WHITE, { signal }),
      stick.morph(WHITE, { signal }),
    ]) {
      await expect(run).rejects.toMatchObject({ name: "AbortError" });
    }
    expect(ft.sendCount()).toBe(0);
    expect(ft.gets).toBe(0);
  });

  test("an already aborted signal rejects with its reason and sends nothing", async () => {
    const { stick, ft } = open("nano");
    const reason = new Error("stop");
    await expect(
      stick.blink(WHITE, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(ft.sendCount()).toBe(0);
  });

  test("aborting mid-effect leaves the LEDs as they are", async () => {
    const { stick, ft } = open("nano");
    const controller = new AbortController();
    const run = stick.blink(WHITE, {
      period: 200,
      iterations: 3,
      signal: controller.signal,
    });
    const settled = expect(run).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    await settled;
    await vi.runAllTimersAsync();
    expect(ft.sendCount()).toBe(1);
    expect(ft.frame(2)).toEqual(fill(2, WHITE));
  });

  test("sleep leaves no timer or listener behind", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const done = sleep(100, controller.signal);
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    const aborted = new AbortController();
    const pending = sleep(100, aborted.signal);
    const settled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    aborted.abort();
    await settled;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("close during an effect rejects it with CLOSED and nothing is sent after close", async () => {
    const { stick, ft } = open("nano");
    const run = stick.blink(WHITE, { period: 200, iterations: 5 });
    const settled = expect(run).rejects.toMatchObject({ code: "CLOSED" });
    await vi.advanceTimersByTimeAsync(150);
    await stick.close();
    const sent = ft.sendCount();
    await vi.runAllTimersAsync();
    await settled;
    expect(ft.sendCount()).toBe(sent);
  });
});

describe("arguments", () => {
  test("bad option values reject and send nothing", async () => {
    const { stick, ft } = open("nano");
    const bad: [Promise<void>, ErrorConstructor][] = [
      [stick.blink(WHITE, { iterations: 0 }), RangeError],
      [stick.blink(WHITE, { iterations: 1.5 }), RangeError],
      [stick.blink(WHITE, { period: 0 }), RangeError],
      [stick.blink(WHITE, { period: -5 }), RangeError],
      [stick.blink(WHITE, { period: Number.NaN }), RangeError],
      [stick.blink(WHITE, { period: Number.POSITIVE_INFINITY }), RangeError],
      [stick.pulse(WHITE, { iterations: 0 }), RangeError],
      [stick.pulse(WHITE, { duration: 0 }), RangeError],
      [stick.morph(WHITE, { duration: -1 }), RangeError],
      [stick.morph(WHITE, { duration: Number.NaN }), RangeError],
      [stick.blink(WHITE, { period: "5" as unknown as number }), TypeError],
      [stick.blink(WHITE, { iterations: "2" as unknown as number }), TypeError],
      [stick.morph(WHITE, { duration: null as unknown as number }), TypeError],
      [stick.blink("red" as unknown as Color), TypeError],
    ];
    for (const [run, type] of bad) {
      await expect(run).rejects.toBeInstanceOf(type);
    }
    expect(ft.sendCount()).toBe(0);
    expect(ft.gets).toBe(0);
  });
});

describe("lerp", () => {
  test("uses integer arithmetic truncating toward zero", () => {
    const a = { r: 200, g: 0, b: 10 };
    const b = { r: 0, g: 255, b: 11 };
    expect(lerp(a, b, 1, 3)).toEqual({ r: 134, g: 85, b: 10 });
    expect(lerp(a, b, 3, 3)).toEqual(b);
  });
});
