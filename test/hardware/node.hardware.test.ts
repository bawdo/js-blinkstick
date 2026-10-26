// Hardware tests need a BlinkStick Nano and a Square attached, and someone
// watching the LEDs. Run them with: npm run test:hardware
//
// They only run when BLINKSTICK_HARDWARE=1. The reconnect test also needs
// BLINKSTICK_RECONNECT=1 and a human to unplug and replug a stick.
//
// EEPROM RULE: these tests must never call setInfoBlock, setName, setMode or
// anything else that writes EEPROM, because EEPROM wears with use. Reading
// info blocks, names and modes is fine. LED values live in RAM and cause no
// wear. Set a name by hand if you want the name tests to do more than read.

import { beforeAll, describe, expect, test } from "vitest";
import { importHid } from "../../src/node/backend.js";
import type { BlinkStick, Color, NodeBlinkStickInfo } from "../../src/node.js";
import { list, open } from "../../src/node.js";
import { PRODUCT_ID, VENDOR_ID } from "../../src/protocol.js";

const enabled = process.env.BLINKSTICK_HARDWARE === "1";
const reconnectEnabled = process.env.BLINKSTICK_RECONNECT === "1";

type Stick = BlinkStick<NodeBlinkStickInfo>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** How long a step stays visible. The Square has more LEDs, so it is held longer. */
function hold(stick: Stick): number {
  return stick.info.model === "square" ? 8000 : 4000;
}

/** Scales effect durations: 1 for the Nano, 2 for the Square. */
function pace(stick: Stick): number {
  return hold(stick) / 4000;
}

const red: Color = { r: 255, g: 0, b: 0 };
const green: Color = { r: 0, g: 255, b: 0 };
const blue: Color = { r: 0, g: 0, b: 255 };
const white: Color = { r: 255, g: 255, b: 255 };
const orange: Color = { r: 255, g: 80, b: 0 };

/** Saturated, easily told apart values, in LED order. */
const palette: { name: string; color: Color }[] = [
  { name: "red", color: red },
  { name: "blue", color: blue },
  { name: "green", color: green },
  { name: "yellow", color: { r: 255, g: 255, b: 0 } },
  { name: "cyan", color: { r: 0, g: 255, b: 255 } },
  { name: "magenta", color: { r: 255, g: 0, b: 255 } },
  { name: "white", color: white },
  { name: "orange", color: orange },
];

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** Opens `serial`, runs `fn`, then always leaves the LEDs off and closes. */
async function withStick<T>(
  serial: string,
  fn: (stick: Stick) => Promise<T>,
): Promise<T> {
  const stick = await open({ serial });
  try {
    return await fn(stick);
  } finally {
    await stick.off().catch(() => undefined);
    await stick.close().catch(() => undefined);
  }
}

describe.skipIf(!enabled)("hardware", { timeout: 120_000 }, () => {
  let infos: NodeBlinkStickInfo[] = [];
  let nanos: NodeBlinkStickInfo[] = [];
  let squares: NodeBlinkStickInfo[] = [];

  /** Runs `fn` once for each attached Nano and Square. */
  function eachStick(
    name: string,
    fn: (stick: Stick) => Promise<void>,
    timeout = 120_000,
  ): void {
    test(name, { timeout }, async (ctx) => {
      const sticks = [...nanos, ...squares];
      if (sticks.length === 0) {
        ctx.skip();
        return;
      }
      for (const info of sticks) {
        console.log(`[${info.model} ${info.serial}] ${name}`);
        await withStick(info.serial, fn);
      }
    });
  }

  beforeAll(async () => {
    // macOS opens HID devices exclusively, so read the raw reports with
    // node-hid directly, and close, before the library opens anything.
    const hid = await importHid();
    const raw = await hid.devicesAsync(VENDOR_ID, PRODUCT_ID);
    // Report sizes exclude the report ID: 2 is 32, 4 is 1, 6 is 25.
    const reports: [number, number][] = [
      [2, 32],
      [4, 1],
      [6, 25],
    ];
    for (const d of raw) {
      if (d.path === undefined) continue;
      const device = await hid.HIDAsync.open(d.path);
      try {
        for (const [id, length] of reports) {
          try {
            const bytes = await device.getFeatureReport(id, length + 1);
            console.log(
              `raw node-hid ${d.serialNumber ?? d.path} report ${id}: asked ${length + 1}, got ${bytes.length} bytes: ${hex(Uint8Array.from(bytes))}`,
            );
          } catch (error) {
            console.log(
              `raw node-hid ${d.serialNumber ?? d.path} report ${id}: ${String(error)}`,
            );
          }
        }
      } finally {
        await device.close();
      }
    }

    infos = await list();
    nanos = infos.filter((i) => i.model === "nano");
    squares = infos.filter((i) => i.model === "square");
    console.log(
      `attached: ${nanos.length} nano, ${squares.length} square, ${infos.length - nanos.length - squares.length} other`,
    );
  });

  test("lists at least one supported stick", (ctx) => {
    if (nanos.length + squares.length === 0) {
      ctx.skip();
      return;
    }
    for (const info of infos) console.log("info", JSON.stringify(info));
  });

  test("info has serial, version, release and the right model", (ctx) => {
    if (infos.length === 0) {
      ctx.skip();
      return;
    }
    for (const info of infos) {
      console.log("info", JSON.stringify(info));
      expect(info.serial).toMatch(/^BS/);
      expect(info.version).not.toBe("");
      expect(info.release).toBeGreaterThan(0);
      expect(info.model, "model should not be unknown").not.toBe("unknown");
    }
  });

  eachStick("frame round trip", async (stick) => {
    const n = stick.ledCount;
    const leds = palette.slice(0, n);
    console.log(`watch: ${leds.map((p) => p.name).join(", ")} in LED order`);
    await stick.setFrame(leds.map((p) => p.color));
    await sleep(hold(stick));
    expect(await stick.getFrame()).toEqual(leds.map((p) => p.color));
  });

  test("square: eight LEDs hold eight distinct colours", async (ctx) => {
    const square = squares[0];
    if (square === undefined) {
      ctx.skip();
      return;
    }
    await withStick(square.serial, async (stick) => {
      expect(stick.ledCount).toBe(8);
      console.log(`watch: ${palette.map((p) => p.name).join(", ")}`);
      await stick.setFrame(palette.map((p) => p.color));
      await sleep(hold(stick));
      expect(await stick.getFrame()).toEqual(palette.map((p) => p.color));
    });
  });

  eachStick("setLed and getLed", async (stick) => {
    const last = stick.ledCount - 1;
    await stick.off();
    await stick.setLed(last, red);
    console.log(`watch: only LED ${last} lit, red`);
    await sleep(hold(stick));
    expect(await stick.getLed(last)).toEqual(red);
    expect(await stick.getLed(0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  eachStick("brightness limit", async (stick) => {
    stick.brightnessLimit = 64;
    await stick.setAll(white);
    console.log("watch: all LEDs dim white, brightness limited to 64");
    await sleep(hold(stick));
    const dim = { r: 64, g: 64, b: 64 };
    expect(await stick.getFrame()).toEqual(
      Array.from({ length: stick.ledCount }, () => dim),
    );
  });

  eachStick("inverted", async (stick) => {
    stick.inverted = true;
    await stick.setAll(red);
    console.log("watch: all LEDs cyan (red inverted)");
    await sleep(hold(stick));
    expect(await stick.getFrame()).toEqual(
      Array.from({ length: stick.ledCount }, () => red),
    );
    // Turn the LEDs off while still inverted, so they really go dark.
    await stick.off();
  });

  eachStick("effects", async (stick) => {
    const p = pace(stick);
    console.log(
      `watch: two white blinks (${800 * p} ms period), one green pulse (${2000 * p} ms), a fade to blue (${2000 * p} ms), then blue held`,
    );
    await stick.blink(white, { period: 800 * p, iterations: 2 });
    await stick.pulse(green, { duration: 2000 * p });
    await stick.morph(blue, { duration: 2000 * p });
    expect(await stick.getFrame()).toEqual(
      Array.from({ length: stick.ledCount }, () => blue),
    );
    await sleep(hold(stick));
  });

  eachStick("aborting a blink leaves the stick usable", async (stick) => {
    const controller = new AbortController();
    const blinking = stick.blink(red, {
      period: 1000,
      iterations: 20,
      signal: controller.signal,
    });
    const settled = blinking.then(
      () => "resolved",
      (error: unknown) =>
        error === controller.signal.reason ? "aborted" : String(error),
    );
    await sleep(2500);
    controller.abort();
    expect(await settled).toBe("aborted");
    await stick.setAll(green);
    expect(await stick.getLed(0)).toEqual(green);
  });

  eachStick("info blocks, name and mode, read only", async (stick) => {
    for (const block of [1, 2] as const) {
      const bytes = await stick.getInfoBlock(block);
      console.log(
        `info block ${block}: ${JSON.stringify(new TextDecoder().decode(bytes))} (${hex(bytes)})`,
      );
    }
    const name = await stick.getName();
    console.log(`name ${JSON.stringify(name)}`);
    expect(typeof name).toBe("string");
    const mode = await stick.getMode();
    console.log(`mode = ${String(mode)}`);
    expect(["ws2812", "ws2812-mirror"]).toContain(mode);
  });

  test("names in list({ names: true }) and open({ name })", async (ctx) => {
    const named = await list({ names: true });
    if (named.length === 0) {
      ctx.skip();
      return;
    }
    const counts = new Map<string, number>();
    for (const n of named) {
      console.log(
        `${n.serial} ${n.model} name ${JSON.stringify(n.name)} busy ${n.busy}`,
      );
      expect(n.busy).toBe(false);
      counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
    }
    let exercised = false;
    for (const n of named) {
      if (
        n.name === "" ||
        (counts.get(n.name) ?? 0) > 1 ||
        n.model === "unknown"
      )
        continue;
      exercised = true;
      const stick = await open({ name: n.name });
      try {
        expect(stick.info.serial).toBe(n.serial);
      } finally {
        await stick.close();
      }
    }
    if (!exercised) {
      console.log(
        "no stick has a unique name, so open({ name }) was not exercised; set one by hand to cover it",
      );
    }
  });

  test("two sticks run at once, and one closing leaves the other", async (ctx) => {
    const [a, b] = [...nanos, ...squares];
    if (a === undefined || b === undefined) {
      ctx.skip();
      return;
    }
    const first = await open({ serial: a.serial });
    const second = await open({ serial: b.serial });
    try {
      await Promise.all(
        [first, second].map(async (stick) => {
          const p = pace(stick);
          for (let i = 0; i < 20; i++) {
            await stick.setAll(i % 2 === 0 ? red : blue);
            await sleep(100 * p);
          }
        }),
      );
      await first.off();
      await first.close();
      await second.setAll(green);
      await sleep(hold(second));
      expect(await second.getFrame()).toEqual(
        Array.from({ length: second.ledCount }, () => green),
      );
    } finally {
      await first.off().catch(() => undefined);
      await first.close().catch(() => undefined);
      await second.off().catch(() => undefined);
      await second.close().catch(() => undefined);
    }
  });

  test.skipIf(!reconnectEnabled)(
    "reconnects after an unplug and replug",
    { timeout: 300_000 },
    async (ctx) => {
      const info = nanos[0] ?? squares[0];
      if (info === undefined) {
        ctx.skip();
        return;
      }
      const stick = await open({ serial: info.serial });
      try {
        await stick.setAll(orange);

        console.log("Unplug the stick now (you have 60 seconds)");
        let gone: unknown;
        for (const end = Date.now() + 60_000; Date.now() < end; ) {
          try {
            await stick.getFrame();
          } catch (error) {
            gone = error;
            break;
          }
          await sleep(200);
        }
        expect(gone, "no error seen while unplugged").toBeDefined();
        console.log(`while unplugged: ${String(gone)}`);
        expect((gone as { code?: string }).code).toBe("DISCONNECTED");

        console.log("Plug it back in (you have 60 seconds)");
        let frame: Color[] | undefined;
        let last: unknown;
        for (const end = Date.now() + 60_000; Date.now() < end; ) {
          try {
            frame = await stick.getFrame();
            break;
          } catch (error) {
            last = error;
          }
          await sleep(200);
        }
        expect(frame, `never reconnected: ${String(last)}`).toBeDefined();
        console.log("watch: the stick should be orange again");
        await sleep(hold(stick));
        expect(frame).toEqual(
          Array.from({ length: stick.ledCount }, () => orange),
        );
      } finally {
        await stick.off().catch(() => undefined);
        await stick.close().catch(() => undefined);
      }
    },
  );
});
