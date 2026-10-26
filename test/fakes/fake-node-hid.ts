export interface FakeDevice {
  path?: string;
  serialNumber?: string;
  manufacturer?: string;
  product?: string;
  release: number;
}

/** A fake HIDAsync: records sends, answers gets from `reports`. */
export class FakeHidAsync {
  sent: number[][] = [];
  gets: { id: number; length: number }[] = [];
  closed = false;
  /** What getFeatureReport returns, by report ID (byte 0 is as the stack gives it). */
  reports: Map<number, Uint8Array> = new Map();
  path: string;
  constructor(path: string) {
    this.path = path;
  }

  sendFeatureReport(data: number[]): Promise<number> {
    this.sent.push([...data]);
    return Promise.resolve(data.length);
  }

  getFeatureReport(id: number, length: number): Promise<Uint8Array> {
    this.gets.push({ id, length });
    const blank = new Uint8Array(length);
    blank[0] = id;
    return Promise.resolve(this.reports.get(id) ?? blank);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

export const nanoDevice: FakeDevice = {
  path: "/dev/nano",
  serialNumber: "BS072777-3.0",
  manufacturer: "Agile Innovative Ltd",
  product: "BlinkStick Nano",
  release: 0x0202,
};
export const squareDevice: FakeDevice = {
  path: "/dev/square",
  serialNumber: "BS073788-3.1",
  manufacturer: "Agile Innovative Ltd",
  product: "BlinkStick Square",
  release: 0x0201,
};

export const state: {
  devices: FakeDevice[];
  opened: FakeHidAsync[];
  enumerations: number;
  filter?: [number, number];
} = { devices: [], opened: [], enumerations: 0 };

export function resetFake(devices: FakeDevice[]): void {
  state.devices = devices;
  state.opened = [];
  state.enumerations = 0;
  delete state.filter;
}

export const fakeNodeHid = {
  devicesAsync(vid: number, pid: number): Promise<FakeDevice[]> {
    state.enumerations++;
    state.filter = [vid, pid];
    return Promise.resolve(state.devices);
  },
  HIDAsync: {
    open(path: string): Promise<FakeHidAsync> {
      const d = new FakeHidAsync(path);
      state.opened.push(d);
      return Promise.resolve(d);
    },
  },
};
