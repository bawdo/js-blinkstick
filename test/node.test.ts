// Never touches real hardware: node-hid is replaced by a fake.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { BlinkStickError } from "../src/errors.js";
import {
  nanoDevice,
  resetFake,
  squareDevice,
  state,
} from "./fakes/fake-node-hid.js";

vi.mock("node-hid", async () => {
  const fake = await import("./fakes/fake-node-hid.js");
  return { default: fake.fakeNodeHid };
});

const { list, open } = await import("../src/node.js");
const { importHid } = await import("../src/node/backend.js");

beforeEach(() => resetFake([nanoDevice, squareDevice]));

describe("node list", () => {
  test("maps devices to info and filters by vendor and product", async () => {
    const infos = await list();
    expect(state.filter).toEqual([0x20a0, 0x41e5]);
    expect(infos).toEqual([
      {
        model: "nano",
        product: "BlinkStick Nano",
        manufacturer: "Agile Innovative Ltd",
        serial: "BS072777-3.0",
        version: "3.0",
        release: 0x0202,
      },
      {
        model: "square",
        product: "BlinkStick Square",
        manufacturer: "Agile Innovative Ltd",
        serial: "BS073788-3.1",
        version: "3.1",
        release: 0x0201,
      },
    ]);
  });

  test("lists unsupported models as unknown", async () => {
    resetFake([{ ...nanoDevice, release: 0x0999 }]);
    expect((await list())[0]?.model).toBe("unknown");
  });

  test("names: true opens each stick and reports busy ones", async () => {
    const named = await list({ names: true });
    expect(named.map((n) => [n.serial, n.name, n.busy])).toEqual([
      ["BS072777-3.0", "", false],
      ["BS073788-3.1", "", false],
    ]);
    expect(state.opened.every((d) => d.closed)).toBe(true);
  });
});

describe("node open", () => {
  test("opens the first stick", async () => {
    const stick = await open();
    expect(stick.info.model).toBe("nano");
    expect(state.opened.map((d) => d.path)).toEqual(["/dev/nano"]);
  });

  test("opens the stick with the given serial", async () => {
    const stick = await open({ serial: "BS073788-3.1" });
    expect(stick.info.model).toBe("square");
    expect(state.opened.map((d) => d.path)).toEqual(["/dev/square"]);
  });

  test("an unknown serial is NOT_FOUND", async () => {
    await expect(open({ serial: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("an empty serial is NOT_FOUND before enumerating", async () => {
    const error = await open({ serial: "" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BlinkStickError);
    expect((error as BlinkStickError).code).toBe("NOT_FOUND");
    expect(state.enumerations).toBe(0);
  });

  test("an empty device serial never matches by serial", async () => {
    resetFake([{ ...nanoDevice, serialNumber: "" }]);
    await expect(open({ serial: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("serial and name together is a TypeError", async () => {
    await expect(open({ serial: "a", name: "b" })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(state.enumerations).toBe(0);
  });
});

describe("node transport", () => {
  test("prepends the report ID on send, strips it on receive", async () => {
    const stick = await open();
    const dev = state.opened[0];
    if (!dev) throw new Error("not opened");
    await stick.setLed(0, { r: 1, g: 2, b: 3 });
    expect(dev.sent.at(-1)).toEqual([5, 0, 0, 1, 2, 3]);
    const framed = new Uint8Array(26);
    framed.set([6, 0, 9, 8, 7], 0); // ID, then LED 0 as G, R, B at 2..4
    dev.reports.set(6, framed);
    expect((await stick.getFrame())[0]).toEqual({ g: 9, r: 8, b: 7 });
    expect(dev.gets).toContainEqual({ id: 6, length: 26 });
  });

  test("passes a frame without a report ID through unchanged", async () => {
    const stick = await open();
    const dev = state.opened[0];
    if (!dev) throw new Error("not opened");
    const frame = new Uint8Array(25);
    frame[1] = 5; // G of LED 0
    frame[2] = 4; // R of LED 0
    frame[3] = 3; // B of LED 0
    dev.reports.set(6, frame);
    expect((await stick.getFrame())[0]).toEqual({ r: 4, g: 5, b: 3 });
  });

  test("close closes the device, and later transfers reject", async () => {
    const stick = await open();
    const dev = state.opened[0];
    await stick.close();
    expect(dev?.closed).toBe(true);
    await expect(stick.getLed(0)).rejects.toThrow();
  });
});

describe("node-hid missing", () => {
  test("importing the entry does not load node-hid", async () => {
    vi.resetModules();
    const loads = vi.fn();
    vi.doMock("node-hid", () => {
      loads();
      return {};
    });
    await import("../src/node.js");
    expect(loads).not.toHaveBeenCalled();
    vi.doUnmock("node-hid");
  });

  test.each(["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"])(
    "%s explains the install",
    async (code) => {
      const cause = Object.assign(new Error("Cannot find package"), { code });
      const error = await importHid(() => Promise.reject(cause)).catch(
        (e: unknown) => e,
      );
      expect((error as Error).message).toBe(
        "@bawdo/blinkstick/node needs node-hid: npm install node-hid",
      );
      expect((error as Error).cause).toBe(cause);
    },
  );

  test("other import errors pass through unchanged", async () => {
    const boom = new Error("native module failed");
    await expect(importHid(() => Promise.reject(boom))).rejects.toBe(boom);
  });

  test("a CJS default export is unwrapped", async () => {
    const hid = { devicesAsync: vi.fn() };
    expect(await importHid(() => Promise.resolve({ default: hid }))).toBe(hid);
    expect(await importHid(() => Promise.resolve(hid))).toBe(hid);
  });
});
