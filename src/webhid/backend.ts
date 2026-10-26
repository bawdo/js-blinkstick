/// <reference types="w3c-web-hid" preserve="true" />
import { PRODUCT_ID, VENDOR_ID } from "../protocol.js";
import type { Backend, Candidate, Identity } from "../transport.js";
import { webhidTransport } from "./transport.js";

/** The picker filter for every BlinkStick model. */
export const FILTERS: HIDDeviceFilter[] = [
  { vendorId: VENDOR_ID, productId: PRODUCT_ID },
];

/**
 * What WebHID tells about a device without opening it. There is no serial,
 * release or manufacturer string, so `manufacturer` is always "".
 */
export function identityOf(device: HIDDevice): Identity {
  const featureReportIds = device.collections.flatMap((c) =>
    (c.featureReports ?? []).flatMap((r) =>
      r.reportId === undefined ? [] : [r.reportId],
    ),
  );
  return { product: device.productName, manufacturer: "", featureReportIds };
}

/** Whether `device` has the BlinkStick vendor and product IDs. */
export function isBlinkStick(device: HIDDevice): boolean {
  return device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID;
}

/** The BlinkSticks among `devices`, as candidates. */
export function candidatesOf(devices: HIDDevice[]): Candidate<HIDDevice>[] {
  return devices
    .filter(isBlinkStick)
    .map((d) => ({ handle: d, identity: identityOf(d) }));
}

/**
 * The WebHID backend for one `HID` object. The handle is the `HIDDevice`.
 * It lists paired, plugged in sticks only, as `getDevices()` does. Opening
 * `owned`, a device the caller handed over, closes it on close even if the
 * caller had it open; any other device is closed only if this opened it.
 */
export function webhidBackend(hid: HID, owned?: HIDDevice): Backend<HIDDevice> {
  return {
    async list() {
      return candidatesOf(await hid.getDevices());
    },
    open(device) {
      return webhidTransport(hid, device, { owned: device === owned });
    },
  };
}
