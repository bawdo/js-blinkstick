import { BlinkStickError } from "../../src/errors.js";
import { REPORT } from "../../src/protocol.js";
import type { Backend, Candidate, Identity } from "../../src/transport.js";
import { FakeTransport } from "./fake-transport.js";

export interface FakeHandle {
  index: number;
}

interface FakeDevice {
  identity: Identity;
  handle: FakeHandle;
  transport: FakeTransport;
  /** Held by another process, so open rejects. */
  busy: boolean;
}

export class FakeBackend implements Backend<FakeHandle> {
  devices: FakeDevice[];

  constructor(devices: { identity: Identity; transport?: FakeTransport }[]) {
    this.devices = devices.map((d, index) => ({
      identity: d.identity,
      handle: { index },
      transport: d.transport ?? new FakeTransport(),
      busy: false,
    }));
  }

  list(): Promise<Candidate<FakeHandle>[]> {
    return Promise.resolve(
      this.devices.map((d) => ({ handle: d.handle, identity: d.identity })),
    );
  }

  open(handle: FakeHandle): Promise<FakeTransport> {
    const d = this.devices.find((x) => x.handle === handle);
    if (!d) {
      return Promise.reject(
        new BlinkStickError("NOT_FOUND", "fake: unknown handle"),
      );
    }
    if (d.busy) {
      return Promise.reject(
        new BlinkStickError(
          "NOT_FOUND",
          `fake: ${d.identity.serial ?? "device"}: busy`,
        ),
      );
    }
    return Promise.resolve(d.transport);
  }

  /** Device i vanishes: its transport fails and it cannot be opened. */
  unplug(i: number): void {
    const d = this.device(i);
    d.transport.gone = true;
    d.busy = true;
  }

  /**
   * Device i comes back as a fresh transport with its LEDs off, as a real
   * stick is after losing power. Info blocks and the mode survive, as EEPROM
   * does. With `newHandle`, the handle is replaced too, as Chrome does when it
   * hands back a new HIDDevice.
   */
  replug(i: number, options?: { newHandle?: boolean }): FakeTransport {
    const d = this.device(i);
    const next = new FakeTransport();
    for (const id of [REPORT.info1, REPORT.info2, REPORT.mode]) {
      const r = d.transport.reports.get(id);
      if (r) next.reports.set(id, r.slice());
    }
    d.transport = next;
    d.busy = false;
    if (options?.newHandle) d.handle = { index: i };
    return next;
  }

  /** Device i is held elsewhere: open rejects, but its transport is intact. */
  busy(i: number): void {
    this.device(i).busy = true;
  }

  private device(i: number): FakeDevice {
    const d = this.devices[i];
    if (!d) throw new RangeError(`fake: no device ${i}`);
    return d;
  }
}

export const nanoInfo: Identity = {
  serial: "BS072777-3.0",
  manufacturer: "Agile Innovative Ltd",
  product: "BlinkStick Nano",
  release: 0x0202,
};

export const squareInfo: Identity = {
  serial: "BS073788-3.1",
  manufacturer: "Agile Innovative Ltd",
  product: "BlinkStick",
  release: 0x0201,
};

export const flexInfo: Identity = {
  serial: "BS000002-3.0",
  manufacturer: "Agile Innovative Ltd",
  product: "BlinkStick Flex",
  release: 0x0203,
};

/** A backend holding a Nano, a Square and a Flex, plus their transports. */
export function threeSticks(): {
  backend: FakeBackend;
  transports: {
    nano: FakeTransport;
    square: FakeTransport;
    flex: FakeTransport;
  };
} {
  const transports = {
    nano: new FakeTransport(),
    square: new FakeTransport(),
    flex: new FakeTransport(),
  };
  const backend = new FakeBackend([
    { identity: nanoInfo, transport: transports.nano },
    { identity: squareInfo, transport: transports.square },
    { identity: flexInfo, transport: transports.flex },
  ]);
  return { backend, transports };
}
