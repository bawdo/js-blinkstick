/// <reference types="w3c-web-hid" />
// Never touches real hardware: WebHID is replaced by a fake. Names are stored
// on fake devices only.

import { afterEach, describe, expect, test, vi } from "vitest";
import { BlinkStickError } from "../src/errors.js";
import { fromHIDDevice, list, open, pair } from "../src/webhid.js";
import {
  asHIDDevice,
  FakeHID,
  FakeHIDDevice,
  nanoDevice,
  squareDevice,
} from "./fakes/fake-webhid.js";

const RED = { r: 255, g: 0, b: 0 };

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webhid list and pair", () => {
  test("list sees only paired BlinkSticks", async () => {
    const nano = nanoDevice();
    const square = squareDevice();
    const unpaired = nanoDevice();
    const mouse = new FakeHIDDevice({ vendorId: 0x046d, productName: "Mouse" });
    const hid = new FakeHID(
      [nano, square, unpaired, mouse],
      [nano, mouse, square],
    );
    expect(await list({ hid: hid.asHID })).toEqual([
      { model: "nano", product: "BlinkStick Nano", manufacturer: "" },
      { model: "square", product: "BlinkStick", manufacturer: "" },
    ]);
  });

  test("list includes unknown models", async () => {
    const other = new FakeHIDDevice({ productName: "BlinkStick" });
    const hid = new FakeHID([other]);
    expect((await list({ hid: hid.asHID }))[0]?.model).toBe("unknown");
  });

  test("pair passes the filter and returns the chosen sticks", async () => {
    const nano = nanoDevice();
    const hid = new FakeHID([nano], []);
    hid.chosen = [nano];
    expect(await pair({ hid: hid.asHID })).toEqual([
      { model: "nano", product: "BlinkStick Nano", manufacturer: "" },
    ]);
    expect(hid.requests).toEqual([
      { filters: [{ vendorId: 0x20a0, productId: 0x41e5 }] },
    ]);
    expect(await list({ hid: hid.asHID })).toHaveLength(1);
  });

  test("names: true reads names and closes what it opened", async () => {
    const nano = nanoDevice("desk");
    const square = squareDevice();
    const hid = new FakeHID([nano, square]);
    const named = await list({ hid: hid.asHID, names: true });
    expect(named.map((n) => [n.model, n.name, n.busy])).toEqual([
      ["nano", "desk", false],
      ["square", "", false],
    ]);
    expect([nano.opened, square.opened]).toEqual([false, false]);
    expect(hid.listeners.get("disconnect")).toBe(0);
  });
});

describe("webhid open", () => {
  test("open() opens the first paired stick and calls device.open()", async () => {
    const nano = nanoDevice();
    const square = squareDevice();
    const hid = new FakeHID([nano, square]);
    const stick = await open({ hid: hid.asHID });
    expect(stick.info.model).toBe("nano");
    expect([nano.opens, square.opens]).toEqual([1, 0]);
    await stick.setLed(0, RED);
    expect(nano.sent.at(-1)).toEqual([5, [0, 0, 255, 0, 0]]);
  });

  test("an already open device is not opened again", async () => {
    const nano = nanoDevice();
    await nano.open();
    const hid = new FakeHID([nano]);
    await open({ hid: hid.asHID });
    expect(nano.opens).toBe(1);
  });

  test("open({ name }) opens the stick with that name", async () => {
    const hid = new FakeHID([nanoDevice("a"), squareDevice("b")]);
    const stick = await open({ hid: hid.asHID, name: "b" });
    expect(stick.info.model).toBe("square");
  });

  test("no paired stick is NOT_FOUND", async () => {
    const hid = new FakeHID([]);
    const error = await rejection(open({ hid: hid.asHID }));
    expect(error).toBeInstanceOf(BlinkStickError);
    expect((error as BlinkStickError).code).toBe("NOT_FOUND");
  });
});

describe("webhid transport", () => {
  test("receiveFeatureReport works with a leading report ID byte", async () => {
    const nano = nanoDevice();
    const stick = await open({ hid: new FakeHID([nano]).asHID });
    const framed = new Uint8Array(26);
    framed.set([6, 0, 9, 8, 7]); // ID, channel, then LED 0 as G, R, B
    nano.reports.set(6, new DataView(framed.buffer));
    expect((await stick.getFrame())[0]).toEqual({ g: 9, r: 8, b: 7 });
  });

  test("receiveFeatureReport works without a leading report ID byte", async () => {
    const nano = nanoDevice();
    const stick = await open({ hid: new FakeHID([nano]).asHID });
    const frame = new Uint8Array(25);
    frame.set([0, 5, 4, 3]); // channel, then LED 0 as G, R, B
    nano.reports.set(6, new DataView(frame.buffer));
    expect((await stick.getFrame())[0]).toEqual({ r: 4, g: 5, b: 3 });
  });

  test("respects the DataView's offset and length", async () => {
    const nano = nanoDevice();
    const stick = await open({ hid: new FakeHID([nano]).asHID });
    const buffer = new Uint8Array(40).fill(0xee);
    buffer.fill(0, 7, 7 + 25);
    buffer.set([0, 5, 4, 3], 7);
    nano.reports.set(6, new DataView(buffer.buffer, 7, 25));
    expect((await stick.getFrame())[0]).toEqual({ r: 4, g: 5, b: 3 });
  });

  test("close removes the listener and closes the device", async () => {
    const nano = nanoDevice();
    const hid = new FakeHID([nano]);
    const stick = await open({ hid: hid.asHID });
    expect(hid.listeners.get("disconnect")).toBe(1);
    await stick.close();
    expect(hid.listeners.get("disconnect")).toBe(0);
    expect(nano.closes).toBe(1);
    // Released, so it can be opened again.
    await (await open({ hid: hid.asHID })).close();
  });
});

describe("webhid fromHIDDevice", () => {
  test("a model hint makes an undetectable stick a Square", async () => {
    const device = new FakeHIDDevice({ productName: "BlinkStick" });
    const hid = new FakeHID([device]);
    const stick = await fromHIDDevice(asHIDDevice(device), {
      hid: hid.asHID,
      model: "square",
    });
    expect(stick.ledCount).toBe(8);
    expect(device.opens).toBe(1);
  });

  test("without a hint it rejects UNSUPPORTED_MODEL and releases the device", async () => {
    const device = new FakeHIDDevice({ productName: "BlinkStick" });
    const hid = new FakeHID([device]);
    const error = await rejection(
      fromHIDDevice(asHIDDevice(device), { hid: hid.asHID }),
    );
    expect((error as BlinkStickError).code).toBe("UNSUPPORTED_MODEL");
    expect(device.opened).toBe(false);
    expect(hid.listeners.get("disconnect") ?? 0).toBe(0);
    // Not left held: a hinted wrap of the same device succeeds.
    await fromHIDDevice(asHIDDevice(device), {
      hid: hid.asHID,
      model: "square",
    });
  });

  test("a hint that conflicts with detection rejects UNSUPPORTED_MODEL", async () => {
    const device = nanoDevice();
    const hid = new FakeHID([device]);
    const error = await rejection(
      fromHIDDevice(asHIDDevice(device), { hid: hid.asHID, model: "square" }),
    );
    expect((error as BlinkStickError).code).toBe("UNSUPPORTED_MODEL");
  });
});

describe("webhid reconnect", () => {
  test("disconnect then connect of a same-named device reconnects", async () => {
    const before = squareDevice("desk");
    const other = squareDevice("shelf");
    const hid = new FakeHID([before, other]);
    const stick = await open({ hid: hid.asHID });
    expect(await stick.getName()).toBe("desk");
    hid.disconnect(before);
    const after = squareDevice("desk");
    hid.connect(after);
    const sentBefore = before.sent.length;
    const receivedBefore = before.received.length;
    await stick.setAll(RED);
    // The listener made the old transport fail fast: nothing reached it.
    expect(before.sent.length).toBe(sentBefore);
    expect(before.received.length).toBe(receivedBefore);
    expect(after.sent.at(-1)?.[0]).toBe(6);
    expect(other.sent).toEqual([]);
    expect(other.opened).toBe(false);
    expect(hid.listeners.get("disconnect")).toBe(1);
  });

  test("a disconnect for another device changes nothing", async () => {
    const nano = nanoDevice();
    const square = squareDevice();
    const hid = new FakeHID([nano, square]);
    const stick = await open({ hid: hid.asHID });
    hid.disconnect(square);
    await stick.setAll(RED);
    expect(nano.sent).toHaveLength(1);
    expect(nano.opens).toBe(1);
  });
});

describe("webhid exclusive open", () => {
  test("listNamed reports a stick held by an open BlinkStick as busy", async () => {
    const nano = nanoDevice("desk");
    const square = squareDevice("shelf");
    const hid = new FakeHID([nano, square]);
    const stick = await open({ hid: hid.asHID });
    const named = await list({ hid: hid.asHID, names: true });
    expect(named.map((n) => [n.model, n.name, n.busy])).toEqual([
      ["nano", "", true],
      ["square", "shelf", false],
    ]);
    expect(nano.closes).toBe(0);
    await stick.setAll(RED);
    expect(nano.opens).toBe(1);
  });

  test("reading names does not close a held device", async () => {
    const nano = nanoDevice("desk");
    const square = squareDevice("shelf");
    const hid = new FakeHID([nano, square]);
    const held = await open({ hid: hid.asHID });
    const named = await open({ hid: hid.asHID, name: "shelf" });
    expect(named.info.model).toBe("square");
    expect(nano.closes).toBe(0);
    expect(nano.opened).toBe(true);
    await held.setAll(RED);
    expect(nano.sent).toHaveLength(1);
  });

  test("a held device cannot be wrapped twice", async () => {
    const nano = nanoDevice();
    const hid = new FakeHID([nano]);
    await open({ hid: hid.asHID });
    const error = await rejection(
      fromHIDDevice(asHIDDevice(nano), { hid: hid.asHID }),
    );
    expect((error as BlinkStickError).code).toBe("NOT_FOUND");
    expect((error as Error).message).toMatch(/busy/);
  });
});

describe("webhid without navigator.hid", () => {
  test("importing src/webhid.ts with no navigator global does not throw", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.resetModules();
    const entry = await import("../src/webhid.js");
    expect(typeof entry.open).toBe("function");
    const error = await rejection(entry.list());
    expect((error as Error).message).toMatch(/WebHID is unavailable/);
  });

  test("defaults to navigator.hid, read at call time", async () => {
    const hid = new FakeHID([nanoDevice()]);
    vi.stubGlobal("navigator", { hid });
    expect(await list()).toHaveLength(1);
  });
});
