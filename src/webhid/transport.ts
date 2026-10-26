/// <reference types="w3c-web-hid" preserve="true" />
import { BlinkStickError } from "../errors.js";
import type { Transport } from "../transport.js";
import { stripReportId } from "../transport.js";

/**
 * Devices held by a live transport. WebHID lets a page open a device twice,
 * so this gives it hidapi's exclusive open: discovery then sees a held stick
 * as busy and never closes a device another stick is using.
 */
const held = new WeakSet<HIDDevice>();

export interface WebHidTransportOptions {
  /**
   * Close the device on `close` even if it was already open, because the
   * caller handed it over. Otherwise only a device this transport opened is
   * closed, so one the caller opened is left open.
   */
  owned?: boolean;
}

/**
 * Opens `device` (unless it is already open) and wraps it. WebHID takes the
 * report ID separately on send, and may or may not return it on receive, so
 * `stripReportId` normalises what comes back. A `disconnect` event for this
 * device makes later transfers reject at once, so reconnect does not wait on
 * a dead device. Transfers after `close` reject.
 */
export async function webhidTransport(
  hid: HID,
  device: HIDDevice,
  options: WebHidTransportOptions = {},
): Promise<Transport> {
  if (held.has(device)) {
    throw new BlinkStickError(
      "NOT_FOUND",
      `blinkstick: ${device.productName} is busy: another stick has it open`,
    );
  }
  held.add(device);
  const closeOnClose = options.owned === true || !device.opened;
  try {
    if (!device.opened) await device.open();
  } catch (error) {
    held.delete(device);
    throw error;
  }
  let closed = false;
  let disconnected = false;
  const onDisconnect = (event: HIDConnectionEvent): void => {
    if (event.device === device) disconnected = true;
  };
  hid.addEventListener("disconnect", onDisconnect);
  const live = (): void => {
    if (closed) throw new Error("blinkstick: transport is closed");
    if (disconnected) throw new Error("blinkstick: device disconnected");
  };
  return {
    async sendFeatureReport(reportId, data) {
      live();
      // A copy, so WebHID gets a plain ArrayBuffer-backed view.
      await device.sendFeatureReport(reportId, Uint8Array.from(data));
    },
    async receiveFeatureReport(reportId, length) {
      live();
      const view = await device.receiveFeatureReport(reportId);
      const bytes = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      );
      return stripReportId(reportId, length, bytes);
    },
    async close() {
      if (closed) return;
      closed = true;
      hid.removeEventListener("disconnect", onDisconnect);
      held.delete(device);
      if (closeOnClose) await device.close();
    },
  };
}
