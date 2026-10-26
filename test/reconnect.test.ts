// These tests write names and modes through FakeTransport only, never to a
// real stick.

import { describe, expect, test } from "vitest";
import type { BlinkStick } from "../src/blinkstick.js";
import type { Color } from "../src/color.js";
import { WHITE } from "../src/color.js";
import { openStick } from "../src/discovery.js";
import { BlinkStickError } from "../src/errors.js";
import { encodeFrame, REPORT } from "../src/protocol.js";
import type { Identity } from "../src/transport.js";
import {
  FakeBackend,
  nanoInfo,
  squareInfo,
  threeSticks,
} from "./fakes/fake-backend.js";
import {
  descriptorPlatform,
  nameStick,
  type SerialInfo,
  serialPlatform,
} from "./fakes/fake-platform.js";
import { FakeTransport } from "./fakes/fake-transport.js";

const RED: Color = { r: 255, g: 0, b: 0 };
const GREEN: Color = { r: 0, g: 255, b: 0 };
const BLUE: Color = { r: 0, g: 0, b: 255 };

function fill(n: number, c: Color): Color[] {
  return Array.from({ length: n }, () => ({ ...c }));
}

async function rejection(p: Promise<unknown>): Promise<BlinkStickError> {
  const error = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BlinkStickError);
  return error as BlinkStickError;
}

/** Opens the Nano in threeSticks by serial, so it can reconnect. */
async function openNano(): Promise<{
  stick: BlinkStick<SerialInfo>;
  backend: FakeBackend;
  old: FakeTransport;
}> {
  const { backend, transports } = threeSticks();
  const stick = await openStick(serialPlatform(backend), {
    match: (i) => i.serial === nanoInfo.serial,
  });
  return { stick, backend, old: transports.nano };
}

describe("reconnect", () => {
  test("reconnectAfterReplug", async () => {
    const { stick, backend, old } = await openNano();
    await stick.setAll(RED);
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.setAll(BLUE);
    expect(old.closed).toBe(true);
    expect(next.frame(2)).toEqual(fill(2, BLUE));
  });

  test("reconnectRepaintsLastFrame", async () => {
    const { stick, backend } = await openNano();
    await stick.setFrame([RED, GREEN]);
    backend.unplug(0);
    const next = backend.replug(0);
    expect(await stick.getFrame()).toEqual([RED, GREEN]);
    expect(next.frame(2)).toEqual([RED, GREEN]);
  });

  test("reconnectRepaintsInverted", async () => {
    const { stick, backend } = await openNano();
    stick.inverted = true;
    await stick.setAll(RED);
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.getFrame();
    expect(next.frame(2)).toEqual(fill(2, { r: 0, g: 255, b: 255 }));
  });

  test("reconnectNothingToRepaint", async () => {
    const { stick, backend } = await openNano();
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.getName();
    expect(next.sendCount()).toBe(0);
  });

  test("disconnectedFailsFast", async () => {
    const { stick, backend, old } = await openNano();
    backend.unplug(0);
    const first = await rejection(stick.setAll(WHITE));
    expect(first.code).toBe("DISCONNECTED");
    expect(old.sendCount()).toBe(3);
    const second = await rejection(stick.setAll(WHITE));
    expect(second.code).toBe("DISCONNECTED");
    expect(old.sendCount()).toBe(3);
    const next = backend.replug(0);
    await stick.setAll(GREEN);
    expect(next.frame(2)).toEqual(fill(2, GREEN));
  });

  test("closeWhileDisconnected", async () => {
    const { stick, backend } = await openNano();
    backend.unplug(0);
    await stick.setAll(WHITE).catch(() => undefined);
    await stick.close();
    backend.replug(0);
    expect((await rejection(stick.setAll(WHITE))).code).toBe("CLOSED");
    expect((await rejection(stick.close())).code).toBe("CLOSED");
  });

  test("reconnectKeepsSettings", async () => {
    const { stick, backend } = await openNano();
    stick.brightnessLimit = 128;
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.setAll(WHITE);
    expect(next.frame(2)).toEqual(fill(2, { r: 128, g: 128, b: 128 }));
  });

  test("reconnectKeepsInfo", async () => {
    const { stick, backend } = await openNano();
    const info = stick.info;
    backend.unplug(0);
    backend.replug(0);
    await stick.setAll(WHITE);
    expect(stick.info).toBe(info);
  });

  test("disconnectedErrorText", async () => {
    const { stick, backend } = await openNano();
    backend.unplug(0);
    const error = await rejection(stick.setAll(WHITE));
    expect(error.code).toBe("DISCONNECTED");
    expect(error.message).toBe("blinkstick: device disconnected: BS072777-3.0");
    expect(error.cause).toBeInstanceOf(BlinkStickError);
    expect((error.cause as BlinkStickError).code).toBe("NOT_FOUND");
  });

  test("disconnectedRepaintFailureKeepsCause", async () => {
    const { stick, backend } = await openNano();
    await stick.setAll(WHITE);
    backend.unplug(0);
    const next = backend.replug(0);
    // The repaint fails, then the stick answers. getName is not a frame send,
    // so reconnect repaints before retrying it.
    next.fail = 3;
    const error = await rejection(stick.getName());
    expect(error.code).toBe("DISCONNECTED");
    expect(error.message).toContain("repaint");
    expect(error.cause).toBeInstanceOf(Error);
  });

  test("reconnectRepaintsSetLed", async () => {
    const { stick, backend } = await openNano();
    await stick.setFrame([RED, GREEN]);
    await stick.setLed(1, BLUE);
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.getFrame();
    expect(next.frame(2)).toEqual([RED, BLUE]);
  });

  test("setLed seed keeps the other LEDs for the repaint", async () => {
    const { stick, backend, old } = await openNano();
    // Painted before this process opened the stick.
    old.reports.set(REPORT.frame, encodeFrame([RED, GREEN]));
    await stick.setLed(0, BLUE);
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.getFrame();
    expect(next.frame(2)).toEqual([BLUE, GREEN]);
  });

  test("modeSurvivesReplug", async () => {
    const { stick, backend } = await openNano();
    await stick.setMode("ws2812-mirror");
    backend.unplug(0);
    backend.replug(0);
    expect(await stick.getMode()).toBe("ws2812-mirror");
  });

  test("reconnectsOnEveryFailedCall", async () => {
    const { stick, backend } = await openNano();
    backend.unplug(0);
    backend.replug(0);
    await stick.setAll(RED);
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.setAll(GREEN);
    expect(next.frame(2)).toEqual(fill(2, GREEN));
  });

  test("withKeyMatchesBySerialOnly", async () => {
    // Node style: a same-model stick with another serial is not a replacement.
    const other = new FakeTransport();
    const backend = new FakeBackend([
      { identity: nanoInfo },
      { identity: { ...nanoInfo, serial: "BS000009-3.0" }, transport: other },
    ]);
    const stick = await openStick(serialPlatform(backend));
    backend.unplug(0);
    const error = await rejection(stick.setAll(WHITE));
    expect(error.code).toBe("DISCONNECTED");
    expect(other.sendCount()).toBe(0);
    expect(other.gets).toBe(0);
  });

  test("repaint uses the frame as passed, not as later mutated by the caller", async () => {
    // A Square, so the frame has 8 LEDs.
    const backend = new FakeBackend([{ identity: squareInfo }]);
    const stick = await openStick(serialPlatform(backend));
    const frame = Array.from({ length: 8 }, () => ({ r: 1, g: 1, b: 1 }));
    await stick.setFrame(frame);
    frame[0] = { r: 9, g: 9, b: 9 };
    backend.unplug(0);
    const ft2 = backend.replug(0);
    await stick.setLed(1, { r: 2, g: 2, b: 2 });
    expect(ft2.frame(8)[0]).toEqual({ r: 1, g: 1, b: 1 });
  });
});

describe("reconnect without a key", () => {
  const browserNano: Identity = {
    product: "BlinkStick Nano",
    manufacturer: "Agile Innovative Ltd",
  };

  function twoNanos(): {
    backend: FakeBackend;
    first: FakeTransport;
    second: FakeTransport;
  } {
    const first = new FakeTransport();
    const second = new FakeTransport();
    const backend = new FakeBackend([
      { identity: { ...browserNano }, transport: first },
      { identity: { ...browserNano }, transport: second },
    ]);
    return { backend, first, second };
  }

  test("no key: reconnects to the same handle when it comes back", async () => {
    const { backend, second } = twoNanos();
    const stick = await openStick(descriptorPlatform(backend));
    backend.unplug(0);
    const next = backend.replug(0);
    await stick.setAll(RED);
    expect(next.frame(2)).toEqual(fill(2, RED));
    expect(second.sendCount()).toBe(0);
    expect(second.gets).toBe(0);
  });

  test("no key: falls back to the remembered name after getName()", async () => {
    const { backend, first, second } = twoNanos();
    nameStick(first, "shelf");
    nameStick(second, "desk");
    const stick = await openStick(descriptorPlatform(backend), {
      match: (i) => i === backend.devices[1]?.identity,
    });
    expect(await stick.getName()).toBe("desk");
    backend.unplug(1);
    const next = backend.replug(1, { newHandle: true });
    await stick.setAll(RED);
    expect(next.frame(2)).toEqual(fill(2, RED));
    expect(first.sendCount()).toBe(0);
  });

  test("no key: falls back to the only stick of the same model", async () => {
    const { backend, transports } = threeSticks();
    const stick = await openStick(descriptorPlatform(backend));
    expect(stick.info.model).toBe("nano");
    backend.unplug(0);
    const next = backend.replug(0, { newHandle: true });
    await stick.setAll(RED);
    expect(next.frame(2)).toEqual(fill(2, RED));
    // No name was remembered, so no candidate's name was read.
    expect(transports.square.gets).toBe(0);
    expect(transports.flex.gets).toBe(0);
  });

  test("no key: a remembered name with no match rejects DISCONNECTED", async () => {
    const { backend, first, second } = twoNanos();
    nameStick(first, "shelf");
    nameStick(second, "desk");
    const stick = await openStick(descriptorPlatform(backend), {
      name: "desk",
    });
    const shelfSends = first.sendCount();
    // Desk disappears from the listing, leaving shelf as the only Nano.
    backend.unplug(1);
    backend.devices.splice(1, 1);
    const error = await rejection(stick.setAll(RED));
    expect(error.code).toBe("DISCONNECTED");
    expect(first.sendCount()).toBe(shelfSends);
  });

  test("no key: a remembered name on two sticks rejects DISCONNECTED", async () => {
    const transports = [0, 1, 2].map(() => new FakeTransport());
    for (const t of transports) nameStick(t, "desk");
    const backend = new FakeBackend(
      transports.map((transport) => ({
        identity: { ...browserNano },
        transport,
      })),
    );
    const stick = await openStick(descriptorPlatform(backend), {
      match: (i) => i === backend.devices[2]?.identity,
    });
    expect(await stick.getName()).toBe("desk");
    backend.unplug(2);
    backend.devices.splice(2, 1);
    const error = await rejection(stick.setAll(RED));
    expect(error.code).toBe("DISCONNECTED");
    expect(transports[0]?.sendCount()).toBe(0);
    expect(transports[1]?.sendCount()).toBe(0);
  });

  test("no key: a same-named stick of another model is not read or chosen", async () => {
    const nano = new FakeTransport();
    const square = new FakeTransport();
    nameStick(nano, "desk");
    nameStick(square, "desk");
    const backend = new FakeBackend([
      { identity: { ...browserNano }, transport: nano },
      {
        identity: {
          product: "BlinkStick",
          manufacturer: "Agile Innovative Ltd",
          featureReportIds: [1, 2, 3, 10],
        },
        transport: square,
      },
    ]);
    const stick = await openStick(descriptorPlatform(backend), {
      match: (i) => i === backend.devices[0]?.identity,
    });
    await stick.getName();
    backend.unplug(0);
    backend.devices.splice(0, 1);
    const error = await rejection(stick.setAll(RED));
    expect(error.code).toBe("DISCONNECTED");
    expect(square.gets).toBe(0);
    expect(square.sendCount()).toBe(0);
  });

  test("no key: a hinted stick reconnects as the only stick of its model", async () => {
    const backend = new FakeBackend([
      {
        identity: {
          product: "BlinkStick",
          manufacturer: "Agile Innovative Ltd",
          featureReportIds: [1, 2, 3],
        },
      },
      { identity: { ...browserNano } },
    ]);
    const stick = await openStick(descriptorPlatform(backend), {
      hint: "square",
    });
    expect(stick.info.model).toBe("square");
    backend.unplug(0);
    const next = backend.replug(0, { newHandle: true });
    await stick.setAll(RED);
    expect(next.frame(8)).toEqual(fill(8, RED));
  });

  test("no key: two sticks of the same model and no name rejects DISCONNECTED", async () => {
    const { backend, second } = twoNanos();
    const stick = await openStick(descriptorPlatform(backend));
    backend.unplug(0);
    backend.replug(0, { newHandle: true });
    const error = await rejection(stick.setAll(RED));
    expect(error.code).toBe("DISCONNECTED");
    expect(error.message).toBe("blinkstick: device disconnected");
    expect(second.sendCount()).toBe(0);
  });
});
