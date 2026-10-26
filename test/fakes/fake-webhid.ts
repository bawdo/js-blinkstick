/// <reference types="w3c-web-hid" />
// A fake WebHID in the shape of the POC's tests: a `HID` that pairs and lists
// devices and dispatches connect and disconnect, and `HIDDevice`s that record
// sends and answer feature reports. Never touches real hardware.

import {
  PRODUCT_ID,
  REPORT,
  REPORT_LENGTH,
  VENDOR_ID,
} from "../../src/protocol.js";

export interface FakeDeviceOptions {
  productName?: string;
  vendorId?: number;
  productId?: number;
  featureReportIds?: number[];
  /** Stored in info block 1, as setName would. */
  name?: string;
}

/** A fake HIDDevice. Reports are served as the stack would, ID byte or not. */
export class FakeHIDDevice extends EventTarget {
  opened = false;
  opens = 0;
  closes = 0;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: { featureReports: { reportId: number }[] }[];
  sent: [number, number[]][] = [];
  received: number[] = [];
  /** What receiveFeatureReport returns, by report ID. */
  reports: Map<number, DataView> = new Map();

  constructor(options: FakeDeviceOptions = {}) {
    super();
    this.vendorId = options.vendorId ?? VENDOR_ID;
    this.productId = options.productId ?? PRODUCT_ID;
    this.productName = options.productName ?? "BlinkStick Nano";
    const ids = options.featureReportIds ?? [1, 2, 3, 4, 5, 6];
    this.collections = [
      { featureReports: ids.map((reportId) => ({ reportId })) },
    ];
    if (options.name !== undefined) this.setName(options.name);
  }

  setName(name: string): void {
    const data = new Uint8Array(REPORT_LENGTH[2]);
    data.set(new TextEncoder().encode(name));
    this.reports.set(REPORT.info1, new DataView(data.buffer));
  }

  open(): Promise<void> {
    this.opens++;
    this.opened = true;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closes++;
    this.opened = false;
    return Promise.resolve();
  }

  sendFeatureReport(
    reportId: number,
    data: ArrayBufferView | ArrayBuffer,
  ): Promise<void> {
    if (!this.opened) return Promise.reject(new Error("fake: not opened"));
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    this.sent.push([reportId, [...bytes]]);
    return Promise.resolve();
  }

  receiveFeatureReport(reportId: number): Promise<DataView> {
    if (!this.opened) return Promise.reject(new Error("fake: not opened"));
    this.received.push(reportId);
    const length = (REPORT_LENGTH as Record<number, number>)[reportId] ?? 0;
    const blank = new DataView(new ArrayBuffer(length));
    return Promise.resolve(this.reports.get(reportId) ?? blank);
  }
}

/** A Square as WebHID describes it: "BlinkStick" with feature report 10. */
export function squareDevice(name?: string): FakeHIDDevice {
  return new FakeHIDDevice({
    productName: "BlinkStick",
    featureReportIds: [1, 2, 3, 4, 5, 6, 10],
    ...(name === undefined ? {} : { name }),
  });
}

/** A Nano as WebHID describes it. */
export function nanoDevice(name?: string): FakeHIDDevice {
  return new FakeHIDDevice(name === undefined ? {} : { name });
}

/** A fake `navigator.hid`. `attached` are plugged in; `paired` are visible. */
export class FakeHID extends EventTarget {
  attached: FakeHIDDevice[];
  paired: FakeHIDDevice[];
  /** What the picker returns from requestDevice. */
  chosen: FakeHIDDevice[] = [];
  requests: unknown[] = [];
  listeners: Map<string, number> = new Map();

  constructor(
    attached: FakeHIDDevice[] = [],
    paired: FakeHIDDevice[] = attached,
  ) {
    super();
    this.attached = attached;
    this.paired = paired;
  }

  getDevices(): Promise<FakeHIDDevice[]> {
    return Promise.resolve(
      this.paired.filter((d) => this.attached.includes(d)),
    );
  }

  requestDevice(options: unknown): Promise<FakeHIDDevice[]> {
    this.requests.push(options);
    for (const d of this.chosen) {
      if (!this.paired.includes(d)) this.paired.push(d);
    }
    return Promise.resolve(this.chosen);
  }

  /** Unplugs `device` and dispatches disconnect. */
  disconnect(device: FakeHIDDevice): void {
    this.attached = this.attached.filter((d) => d !== device);
    this.dispatchEvent(Object.assign(new Event("disconnect"), { device }));
  }

  /** Plugs in an already paired `device` and dispatches connect. */
  connect(device: FakeHIDDevice): void {
    this.attached.push(device);
    if (!this.paired.includes(device)) this.paired.push(device);
    this.dispatchEvent(Object.assign(new Event("connect"), { device }));
  }

  override addEventListener(
    type: string,
    listener: EventListener | EventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListener | EventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) - 1);
    super.removeEventListener(type, listener, options);
  }

  /** This fake, typed as the real thing for the entry's options. */
  get asHID(): HID {
    return this as unknown as HID;
  }
}

/** A fake device, typed as the real thing. */
export function asHIDDevice(device: FakeHIDDevice): HIDDevice {
  return device as unknown as HIDDevice;
}
