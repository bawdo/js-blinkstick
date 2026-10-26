// These tests write names through FakeTransport only, never to a real stick.

import { describe, expect, test } from "vitest";
import type { Color } from "../src/color.js";
import { list, listNamed, openStick, wrapHandle } from "../src/discovery.js";
import { BlinkStickError } from "../src/errors.js";
import type { Identity } from "../src/transport.js";
import {
  FakeBackend,
  flexInfo,
  nanoInfo,
  threeSticks,
} from "./fakes/fake-backend.js";
import {
  descriptorPlatform,
  nameStick,
  serialPlatform,
} from "./fakes/fake-platform.js";
import { FakeTransport } from "./fakes/fake-transport.js";

function fill(n: number, c: Color): Color[] {
  return Array.from({ length: n }, () => ({ ...c }));
}

function bySerial(serial: string): (i: Identity) => boolean {
  return (i) => i.serial === serial;
}

async function rejection(p: Promise<unknown>): Promise<BlinkStickError> {
  const error = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BlinkStickError);
  return error as BlinkStickError;
}

describe("discovery", () => {
  test("list", async () => {
    const { backend } = threeSticks();
    const infos = await list(serialPlatform(backend));
    expect(infos.map((i) => `${i.serial} ${i.model}`)).toEqual([
      "BS072777-3.0 nano",
      "BS073788-3.1 square",
      "BS000002-3.0 unknown",
    ]);
  });

  test("openFirst", async () => {
    const { backend } = threeSticks();
    const stick = await openStick(serialPlatform(backend));
    expect(stick.info.model).toBe("nano");
  });

  test("openFirstUnsupported", async () => {
    const flex = new FakeTransport();
    const backend = new FakeBackend([
      { identity: flexInfo, transport: flex },
      { identity: nanoInfo },
    ]);
    const error = await rejection(openStick(serialPlatform(backend)));
    expect(error.code).toBe("UNSUPPORTED_MODEL");
    // Refused before opening, so nothing is left open.
    expect(backend.opened).toEqual([]);
    expect(flex.sendCount() + flex.gets).toBe(0);
  });

  test("openSerial", async () => {
    const { backend } = threeSticks();
    const stick = await openStick(serialPlatform(backend), {
      match: bySerial("BS073788-3.1"),
    });
    expect(stick.info.model).toBe("square");
    expect(stick.info.product).toBe("BlinkStick");
  });

  test("openSerialNotFound", async () => {
    const { backend } = threeSticks();
    const error = await rejection(
      openStick(serialPlatform(backend), { match: bySerial("BS999999-3.0") }),
    );
    expect(error.code).toBe("NOT_FOUND");
  });

  test("openNoDevices", async () => {
    const error = await rejection(
      openStick(serialPlatform(new FakeBackend([]))),
    );
    expect(error.code).toBe("NOT_FOUND");
  });

  test("openUnsupportedClosesTransport", async () => {
    const { backend, transports } = threeSticks();
    const error = await rejection(
      openStick(serialPlatform(backend), { match: bySerial("BS000002-3.0") }),
    );
    expect(error.code).toBe("UNSUPPORTED_MODEL");
    // Refused before opening, so the transport is never left open.
    expect(backend.opened).toEqual([]);
    expect(transports.flex.sendCount() + transports.flex.gets).toBe(0);
  });

  test("twoDevicesAreIndependent", async () => {
    const { backend, transports } = threeSticks();
    const p = serialPlatform(backend);
    const nano = await openStick(p, { match: bySerial("BS072777-3.0") });
    const square = await openStick(p, { match: bySerial("BS073788-3.1") });
    await nano.setAll({ r: 255, g: 0, b: 0 });
    await square.setAll({ r: 0, g: 255, b: 0 });
    await nano.close();
    await square.setAll({ r: 0, g: 0, b: 255 });
    expect(transports.nano.frame(2)).toEqual(fill(2, { r: 255, g: 0, b: 0 }));
    expect(transports.square.frame(8)).toEqual(fill(8, { r: 0, g: 0, b: 255 }));
  });

  test("plain open() reads no name", async () => {
    const { backend, transports } = threeSticks();
    await openStick(serialPlatform(backend));
    expect(transports.nano.gets).toBe(0);
  });

  test("bothNameAndMatchThrows", async () => {
    const { backend } = threeSticks();
    await expect(
      openStick(serialPlatform(backend), {
        name: "desk",
        match: bySerial("BS072777-3.0"),
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("model hint", () => {
  const plain: Identity = {
    product: "BlinkStick",
    manufacturer: "Agile Innovative Ltd",
    featureReportIds: [1, 2, 3],
  };
  const nano: Identity = {
    product: "BlinkStick Nano",
    manufacturer: "Agile Innovative Ltd",
  };

  test("hint used when detection says unknown; conflicting hint rejects UNSUPPORTED_MODEL naming both", async () => {
    const used = await openStick(
      descriptorPlatform(new FakeBackend([{ identity: plain }])),
      { hint: "square" },
    );
    expect(used.info.model).toBe("square");
    expect(used.ledCount).toBe(8);

    const error = await rejection(
      openStick(descriptorPlatform(new FakeBackend([{ identity: nano }])), {
        hint: "square",
      }),
    );
    expect(error.code).toBe("UNSUPPORTED_MODEL");
    expect(error.message).toContain("nano");
    expect(error.message).toContain("square");
  });

  test("noHintUnknownRefused", async () => {
    const error = await rejection(
      openStick(descriptorPlatform(new FakeBackend([{ identity: plain }]))),
    );
    expect(error.code).toBe("UNSUPPORTED_MODEL");
  });

  test("wrapHandle", async () => {
    const backend = new FakeBackend([{ identity: plain }, { identity: nano }]);
    const p = descriptorPlatform(backend);
    const [first, second] = await backend.list();
    if (!first || !second) throw new Error("fake: missing candidates");
    const stick = await wrapHandle(p, second.handle, second.identity);
    expect(stick.info.model).toBe("nano");
    await stick.setAll({ r: 1, g: 2, b: 3 });
    expect(backend.devices[1]?.transport.frame(2)).toEqual(
      fill(2, { r: 1, g: 2, b: 3 }),
    );

    const opensBefore = backend.opened.length;
    const refused = await rejection(
      wrapHandle(p, first.handle, first.identity),
    );
    expect(refused.code).toBe("UNSUPPORTED_MODEL");
    // Refused before the handle is opened, so a caller's open handle is untouched.
    expect(backend.opened.length).toBe(opensBefore);
    expect(backend.devices[0]?.transport.closed).toBe(false);
    const hinted = await wrapHandle(p, first.handle, first.identity, "square");
    expect(hinted.info.model).toBe("square");
  });
});

describe("names across sticks", () => {
  test("openName", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    nameStick(transports.square, "shelf");
    const stick = await openStick(serialPlatform(backend), { name: "shelf" });
    expect(stick.info.model).toBe("square");
    expect(transports.square.closed).toBe(false);
    expect(transports.nano.closed).toBe(true);
    expect(transports.flex.closed).toBe(true);
  });

  test("openNameIsExact", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.square, "Shelf");
    for (const name of ["shelf", "Shel", " Shelf"]) {
      const error = await rejection(
        openStick(serialPlatform(backend), { name }),
      );
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).not.toContain("busy");
    }
  });

  test("openNameNotFoundCountsBusy", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    backend.busy(0);
    const one = await rejection(
      openStick(serialPlatform(backend), { name: "desk" }),
    );
    expect(one.code).toBe("NOT_FOUND");
    expect(one.message).toBe(
      'blinkstick: no stick is named "desk" (1 stick was busy and could not be checked)',
    );
    backend.busy(1);
    const two = await rejection(
      openStick(serialPlatform(backend), { name: "desk" }),
    );
    expect(two.message).toBe(
      'blinkstick: no stick is named "desk" (2 sticks were busy and could not be checked)',
    );
  });

  test("openNameEmpty", async () => {
    const { backend, transports } = threeSticks();
    const error = await rejection(
      openStick(serialPlatform(backend), { name: "" }),
    );
    expect(error.code).toBe("NOT_FOUND");
    expect(transports.nano.gets).toBe(0);
  });

  test("openNameSkipsBusy", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    nameStick(transports.square, "desk");
    backend.busy(0);
    const stick = await openStick(serialPlatform(backend), { name: "desk" });
    expect(stick.info.model).toBe("square");
  });

  test("openNameDuplicate", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    nameStick(transports.square, "desk");
    const error = await rejection(
      openStick(serialPlatform(backend), { name: "desk" }),
    );
    expect(error.code).toBe("DUPLICATE_NAME");
    expect(error.message).toContain("BS072777-3.0");
    expect(error.message).toContain("BS073788-3.1");
    expect(transports.nano.closed).toBe(true);
    expect(transports.square.closed).toBe(true);
  });

  test("openNameUnsupported", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.flex, "strip");
    const error = await rejection(
      openStick(serialPlatform(backend), { name: "strip" }),
    );
    expect(error.code).toBe("UNSUPPORTED_MODEL");
    expect(transports.flex.closed).toBe(true);
  });

  test("openNameRemembersName", async () => {
    // Browser style with two Nanos, so reconnect has to go by the name the
    // stick was opened with.
    const browserNano: Identity = {
      product: "BlinkStick Nano",
      manufacturer: "Agile Innovative Ltd",
    };
    const desk = new FakeTransport();
    const shelf = new FakeTransport();
    nameStick(desk, "desk");
    nameStick(shelf, "shelf");
    const backend = new FakeBackend([
      { identity: browserNano, transport: shelf },
      { identity: browserNano, transport: desk },
    ]);
    const stick = await openStick(descriptorPlatform(backend), {
      name: "desk",
    });
    backend.unplug(1);
    const next = backend.replug(1, { newHandle: true });
    await stick.setAll({ r: 7, g: 7, b: 7 });
    expect(next.frame(2)).toEqual(fill(2, { r: 7, g: 7, b: 7 }));
  });

  test("listNamed", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    nameStick(transports.flex, "strip");
    backend.busy(1);
    const named = await listNamed(serialPlatform(backend));
    expect(
      named.map(
        (n) => `${n.serial} ${n.model} ${n.name}${n.busy ? " busy" : ""}`,
      ),
    ).toEqual([
      "BS072777-3.0 nano desk",
      "BS073788-3.1 square  busy",
      "BS000002-3.0 unknown strip",
    ]);
    expect(transports.nano.closed).toBe(true);
    expect(transports.flex.closed).toBe(true);
  });

  test("listNamedUnreadableIsBusy", async () => {
    const { backend, transports } = threeSticks();
    nameStick(transports.nano, "desk");
    transports.square.fail = 3;
    const named = await listNamed(serialPlatform(backend));
    expect(
      named.map(
        (n) => `${n.serial} ${n.model} ${n.name}${n.busy ? " busy" : ""}`,
      ),
    ).toEqual([
      "BS072777-3.0 nano desk",
      "BS073788-3.1 square  busy",
      "BS000002-3.0 unknown ",
    ]);
    expect(transports.square.closed).toBe(true);
  });
});
