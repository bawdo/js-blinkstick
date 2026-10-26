import type { Transport } from "../transport.js";
import { stripReportId } from "../transport.js";

/** The slice of node-hid's HIDAsync the transport uses. */
export interface HidDevice {
  sendFeatureReport(data: number[]): Promise<number>;
  getFeatureReport(reportId: number, length: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

/**
 * Wraps an open node-hid device. node-hid wants the report ID as byte 0 of
 * what it sends and may or may not return it on receive, so the ID is added
 * here and `stripReportId` normalises what comes back. Transfers after
 * `close` reject.
 */
export function nodeTransport(device: HidDevice): Transport {
  let closed = false;
  const live = (): void => {
    if (closed) throw new Error("blinkstick: transport is closed");
  };
  return {
    async sendFeatureReport(reportId, data) {
      live();
      await device.sendFeatureReport([reportId, ...data]);
    },
    async receiveFeatureReport(reportId, length) {
      live();
      const bytes = await device.getFeatureReport(reportId, length + 1);
      return stripReportId(reportId, length, Uint8Array.from(bytes));
    },
    async close() {
      if (closed) return;
      closed = true;
      await device.close();
    },
  };
}
