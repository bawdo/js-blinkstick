import { beforeEach, describe, expect, test } from "vitest";
import { BlinkStick, type BlinkStickInfo } from "../src/blinkstick.js";
import type { Color } from "../src/color.js";
import { OFF, WHITE } from "../src/color.js";
import type { Model } from "../src/models.js";
import { encodeFrame, REPORT } from "../src/protocol.js";
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

describe("BlinkStick", () => {
  test("setAllSendsFullFrame", async () => {
    const { stick, ft } = open("square");
    const c = { r: 1, g: 2, b: 3 };
    await stick.setAll(c);
    expect(ft.sendCount()).toBe(1);
    expect(ft.frame(8)).toEqual(fill(8, c));
  });

  test("setAllNanoLeavesUnusedSlotsZero", async () => {
    const { stick, ft } = open("nano");
    await stick.setAll(WHITE);
    expect(ft.frame(8)).toEqual([...fill(2, WHITE), ...fill(6, OFF)]);
  });

  test("off", async () => {
    const { stick, ft } = open("square");
    await stick.setAll(WHITE);
    await stick.off();
    expect(ft.frame(8)).toEqual(fill(8, OFF));
  });

  test("setFrame", async () => {
    const { stick, ft } = open("nano");
    const leds = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 0, b: 255 },
    ];
    await stick.setFrame(leds);
    expect(ft.frame(2)).toEqual(leds);
  });

  test("setFrameWrongLength", async () => {
    const { stick, ft } = open("nano");
    for (const leds of [[], fill(1, WHITE), fill(3, WHITE)]) {
      await expect(stick.setFrame(leds)).rejects.toThrow(RangeError);
    }
    expect(ft.sendCount()).toBe(0);
  });

  test("retriesTransientFailure", async () => {
    const { stick, ft } = open("square");
    ft.fail = 2;
    await stick.setAll(WHITE);
    expect(ft.sendCount()).toBe(3);
  });

  test("givesUpAfterThreeAttempts", async () => {
    const { stick, ft } = open("square");
    ft.fail = 5;
    const err = await stick.setAll(WHITE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).cause).toMatchObject({ message: "general error" });
    expect(ft.sendCount()).toBe(3);
  });

  test("brightnessLimitScalesWrites", async () => {
    const { stick, ft } = open("square");
    stick.brightnessLimit = 128;
    await stick.setAll(WHITE);
    expect(ft.frame(8)).toEqual(fill(8, { r: 128, g: 128, b: 128 }));
  });

  test("brightnessLimit quotes a string in its TypeError", () => {
    const { stick } = open("nano");
    expect(() => {
      stick.brightnessLimit = "10" as unknown as number;
    }).toThrow(
      new TypeError('blinkstick: brightnessLimit must be a number, got "10"'),
    );
  });

  test("brightnessLimit rejects non-integers and out of range values", () => {
    const { stick } = open("nano");
    for (const bad of [-1, 256, 12.5, Number.NaN, Infinity]) {
      expect(() => {
        stick.brightnessLimit = bad;
      }).toThrow(RangeError);
    }
    for (const bad of ["128", null, undefined, true, {}]) {
      expect(() => {
        stick.brightnessLimit = bad as unknown as number;
      }).toThrow(TypeError);
    }
    expect(stick.brightnessLimit).toBe(255);
    stick.brightnessLimit = 0;
    expect(stick.brightnessLimit).toBe(0);
  });

  test("close", async () => {
    const { stick, ft } = open("square");
    await stick.close();
    expect(ft.closed).toBe(true);
    await expect(stick.close()).rejects.toMatchObject({ code: "CLOSED" });
    await expect(stick.setAll(WHITE)).rejects.toMatchObject({ code: "CLOSED" });
    expect(ft.sendCount()).toBe(0);
  });

  test("getFrame after close rejects CLOSED without receiving", async () => {
    const { stick, ft } = open("nano");
    await stick.close();
    await expect(stick.getFrame()).rejects.toMatchObject({ code: "CLOSED" });
    expect(ft.gets).toBe(0);
  });

  test("info", () => {
    const { stick } = open("nano");
    expect(stick.info.model).toBe("nano");
    expect(stick.ledCount).toBe(2);
    expect(open("square").stick.ledCount).toBe(8);
  });

  test("frameReadsBack", async () => {
    const { stick } = open("nano");
    const leds = [
      { r: 10, g: 0, b: 0 },
      { r: 0, g: 20, b: 0 },
    ];
    await stick.setFrame(leds);
    expect(await stick.getFrame()).toEqual(leds);
  });

  test("getLed", async () => {
    const { stick } = open("nano");
    await stick.setFrame([
      { r: 10, g: 0, b: 0 },
      { r: 0, g: 20, b: 0 },
    ]);
    expect(await stick.getLed(1)).toEqual({ r: 0, g: 20, b: 0 });
  });

  test("setLedKeepsOthers", async () => {
    const { stick, ft } = open("square");
    await stick.setAll({ r: 0, g: 0, b: 50 });
    await stick.setLed(3, { r: 255, g: 0, b: 0 });
    const want = fill(8, { r: 0, g: 0, b: 50 });
    want[3] = { r: 255, g: 0, b: 0 };
    expect(ft.frame(8)).toEqual(want);
  });

  test("setLedDoesNotRescaleOthers", async () => {
    const { stick, ft } = open("square");
    stick.brightnessLimit = 128;
    await stick.setAll(WHITE);
    await stick.setLed(0, WHITE);
    expect(ft.frame(8)).toEqual(fill(8, { r: 128, g: 128, b: 128 }));
  });

  test("indexOutOfRange", async () => {
    const { stick, ft } = open("nano");
    for (const i of [-1, 2, 8]) {
      await expect(stick.getLed(i)).rejects.toThrow(RangeError);
      await expect(stick.setLed(i, WHITE)).rejects.toThrow(RangeError);
    }
    expect(ft.sendCount()).toBe(0);
  });

  test("setLedConcurrent", async () => {
    const { stick, ft } = open("square");
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => stick.setLed(i, WHITE)),
    );
    expect(ft.frame(8)).toEqual(fill(8, WHITE));
  });

  test("setLedSendsOneReport5", async () => {
    const { stick, ft } = open("square");
    await stick.setAll({ r: 0, g: 0, b: 50 });
    const sends = ft.sendCount();
    const gets = ft.gets;
    await stick.setLed(3, { r: 255, g: 0, b: 0 });
    expect(ft.sendCount() - sends).toBe(1);
    const sent = ft.sends[sends];
    expect(sent?.id).toBe(REPORT.led);
    expect(Array.from(sent?.data ?? [])).toEqual([0, 3, 255, 0, 0]);
    expect(ft.gets - gets).toBe(0);
    const want = fill(8, { r: 0, g: 0, b: 50 });
    want[3] = { r: 255, g: 0, b: 0 };
    expect(ft.frame(8)).toEqual(want);
  });

  // Go reads d.last directly. The private last frame is not reachable here,
  // so this checks the single seeding read and the resulting device frame.
  test("setLedSeedsLastFrameOnce", async () => {
    const { stick, ft } = open("nano");
    await ft.sendFeatureReport(
      REPORT.frame,
      encodeFrame([
        { r: 0, g: 9, b: 0 },
        { r: 0, g: 0, b: 9 },
      ]),
    );
    await stick.setLed(0, { r: 1, g: 0, b: 0 });
    expect(ft.gets).toBe(1);
    await stick.setLed(1, { r: 2, g: 0, b: 0 });
    expect(ft.gets).toBe(1);
    expect(ft.frame(2)).toEqual([
      { r: 1, g: 0, b: 0 },
      { r: 2, g: 0, b: 0 },
    ]);
  });

  test("setLedBrightnessAndInverse", async () => {
    const { stick, ft } = open("nano");
    await stick.setAll(OFF);
    stick.brightnessLimit = 128;
    stick.inverted = true;
    await stick.setLed(0, WHITE);
    const sent = ft.sends[ft.sends.length - 1];
    expect(Array.from(sent?.data ?? [])).toEqual([0, 0, 127, 127, 127]);
    expect(await stick.getLed(0)).toEqual({ r: 128, g: 128, b: 128 });
  });

  describe("inverted", () => {
    test("inverted rejects a non-boolean with TypeError", async () => {
      const { stick, ft } = open("nano");
      for (const bad of [1, 0, "true", null, undefined, {}]) {
        expect(() => {
          stick.inverted = bad as unknown as boolean;
        }).toThrow(TypeError);
      }
      expect(stick.inverted).toBe(false);
      stick.inverted = true;
      expect(stick.inverted).toBe(true);
      // Setting it does not repaint.
      expect(ft.sendCount()).toBe(0);
    });

    test("inverseOffByDefault", async () => {
      const { stick, ft } = open("nano");
      await stick.setAll({ r: 255, g: 0, b: 0 });
      expect(ft.frame(2)).toEqual(fill(2, { r: 255, g: 0, b: 0 }));
    });

    test("inverseFlipsWrites", async () => {
      const { stick, ft } = open("nano");
      stick.inverted = true;
      await stick.setAll({ r: 255, g: 0, b: 0 });
      expect(ft.frame(8)).toEqual([
        ...fill(2, { r: 0, g: 255, b: 255 }),
        ...fill(6, OFF),
      ]);
    });

    test("inverseReadsBackWhatWasWritten", async () => {
      const { stick } = open("nano");
      stick.inverted = true;
      const leds = [
        { r: 10, g: 0, b: 0 },
        { r: 0, g: 20, b: 0 },
      ];
      await stick.setFrame(leds);
      expect(await stick.getFrame()).toEqual(leds);
      expect(await stick.getLed(1)).toEqual({ r: 0, g: 20, b: 0 });
    });

    test("inverseAppliesAfterBrightnessLimit", async () => {
      const { stick, ft } = open("nano");
      stick.brightnessLimit = 128;
      stick.inverted = true;
      await stick.setAll(WHITE);
      expect(ft.frame(2)).toEqual(fill(2, { r: 127, g: 127, b: 127 }));
    });

    test("inverseSetLedKeepsOthers", async () => {
      const { stick, ft } = open("square");
      stick.inverted = true;
      await stick.setAll({ r: 0, g: 0, b: 50 });
      await stick.setLed(3, { r: 255, g: 0, b: 0 });
      const want = fill(8, { r: 255, g: 255, b: 205 });
      want[3] = { r: 0, g: 255, b: 255 };
      expect(ft.frame(8)).toEqual(want);
    });
  });

  describe("validation", () => {
    let stick: BlinkStick;
    let ft: FakeTransport;
    beforeEach(() => {
      ({ stick, ft } = open("nano"));
    });

    test.each([
      { r: 300, g: 0, b: 0 },
      { r: -1, g: 0, b: 0 },
      { r: 12.5, g: 0, b: 0 },
      { r: Number.NaN, g: 0, b: 0 },
    ])("setAll rejects %o and sends nothing", async (c) => {
      await expect(stick.setAll(c)).rejects.toThrow(RangeError);
      expect(ft.sendCount()).toBe(0);
    });

    test("setAll rejects a colour missing a channel with TypeError", async () => {
      await expect(
        stick.setAll({ r: 1, g: 2 } as unknown as Color),
      ).rejects.toThrow(TypeError);
      await expect(stick.setAll(null as unknown as Color)).rejects.toThrow(
        TypeError,
      );
      expect(ft.sendCount()).toBe(0);
    });

    test("setFrame rejects a bad colour without sending", async () => {
      await expect(
        stick.setFrame([WHITE, { r: 256, g: 0, b: 0 }]),
      ).rejects.toThrow(RangeError);
      expect(ft.sendCount()).toBe(0);
    });

    test('getLed(1.5) and setLed("1", c) reject without sending', async () => {
      await expect(stick.getLed(1.5)).rejects.toThrow(RangeError);
      await expect(
        stick.setLed("1" as unknown as number, WHITE),
      ).rejects.toThrow(TypeError);
      expect(ft.sendCount()).toBe(0);
      expect(ft.gets).toBe(0);
    });
  });

  test("an unawaited setAll and setLed use the inverted value from call time", async () => {
    const { stick, ft } = open("nano");
    const a = stick.setAll({ r: 10, g: 20, b: 30 });
    const b = stick.setLed(0, { r: 1, g: 2, b: 3 });
    stick.inverted = true;
    await Promise.all([a, b]);
    expect(ft.frame(2)).toEqual([
      { r: 1, g: 2, b: 3 },
      { r: 10, g: 20, b: 30 },
    ]);
  });

  test("an unawaited getFrame ignores a later change to inverted", async () => {
    const { stick } = open("nano");
    await stick.setAll({ r: 10, g: 20, b: 30 });
    const read = stick.getFrame();
    stick.inverted = true;
    expect(await read).toEqual(fill(2, { r: 10, g: 20, b: 30 }));
  });

  test("an unawaited setAll ignores a later brightnessLimit change", async () => {
    const { stick, ft } = open("nano");
    const p = stick.setAll(WHITE);
    stick.brightnessLimit = 0;
    await p;
    expect(ft.frame(2)).toEqual(fill(2, WHITE));
  });

  test("mutating a setFrame array or colour after the call changes nothing", async () => {
    const { stick, ft } = open("nano");
    const c = { r: 5, g: 6, b: 7 };
    const frame = [c, { r: 1, g: 1, b: 1 }];
    const p = stick.setFrame(frame);
    frame[0] = { r: 999, g: 0, b: 0 };
    c.r = 200;
    await p;
    expect(ft.frame(2)).toEqual([
      { r: 5, g: 6, b: 7 },
      { r: 1, g: 1, b: 1 },
    ]);
  });

  test("a failed call does not stop later calls", async () => {
    const { stick, ft } = open("nano");
    ft.fail = 3;
    const bad = stick.setAll(WHITE);
    const good = stick.setAll({ r: 1, g: 1, b: 1 });
    await expect(bad).rejects.toThrow();
    await good;
    expect(ft.frame(2)).toEqual(fill(2, { r: 1, g: 1, b: 1 }));
  });

  test.skipIf(!Symbol.asyncDispose)(
    "asyncDispose closes the stick",
    async () => {
      const { stick, ft } = open("nano");
      await stick[Symbol.asyncDispose]();
      expect(ft.closed).toBe(true);
      await expect(stick.off()).rejects.toMatchObject({ code: "CLOSED" });
    },
  );

  test.skipIf(!Symbol.asyncDispose)(
    "asyncDispose after close resolves, while a second close rejects CLOSED",
    async () => {
      const { stick } = open("nano");
      await stick.close();
      await expect(stick[Symbol.asyncDispose]()).resolves.toBeUndefined();
      await expect(stick.close()).rejects.toMatchObject({ code: "CLOSED" });
    },
  );
});
