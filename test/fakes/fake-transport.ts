import type { Color } from "../../src/color.js";
import {
  decodeFrame,
  FRAME_LEDS,
  REPORT,
  REPORT_LENGTH,
} from "../../src/protocol.js";
import type { Transport } from "../../src/transport.js";

/**
 * Behaves like BlinkStick firmware: a get returns the last report sent with
 * the same ID, or zeros. Reports are stored without the report ID. Nothing
 * here touches a real stick, so writing info blocks causes no EEPROM wear.
 */
export class FakeTransport implements Transport {
  reports: Map<number, Uint8Array> = new Map([[REPORT.mode, Uint8Array.of(2)]]);
  /** Every send attempt, failed ones included. */
  sends: { id: number; data: Uint8Array }[] = [];
  /** Receive calls, failed ones included. */
  gets = 0;
  /** Fail this many upcoming transfers, then succeed. */
  fail = 0;
  /** Unplugged: every transfer rejects. */
  gone = false;
  /**
   * After a report 4 write is accepted, every transfer rejects for this many
   * milliseconds of Date.now, as a real stick does while it writes EEPROM.
   * Infinity means it never answers again.
   */
  busyAfterModeMs = 0;
  /** Date.now before which transfers reject, set by a report 4 write. */
  private busyUntil = 0;
  closed = false;

  sendFeatureReport(reportId: number, data: Uint8Array): Promise<void> {
    this.sends.push({ id: reportId, data: data.slice() });
    const failure = this.failure();
    if (failure) return Promise.reject(failure);
    this.reports.set(reportId, data.slice());
    if (reportId === REPORT.led) this.applyLed(data);
    if (reportId === REPORT.mode && this.busyAfterModeMs > 0) {
      this.busyUntil = Date.now() + this.busyAfterModeMs;
    }
    return Promise.resolve();
  }

  receiveFeatureReport(reportId: number, length: number): Promise<Uint8Array> {
    this.gets++;
    const failure = this.failure();
    if (failure) return Promise.reject(failure);
    const out = new Uint8Array(length);
    const stored = this.reports.get(reportId);
    if (stored) out.set(stored.subarray(0, length));
    return Promise.resolve(out);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Decodes the last report 6 the fake accepted. */
  frame(count: number): Color[] {
    return decodeFrame(
      this.reports.get(REPORT.frame) ?? new Uint8Array(REPORT_LENGTH[6]),
      count,
    );
  }

  /** Decodes every report 6 send attempt, in order. */
  sentFrames(count: number): Color[][] {
    return this.sends
      .filter((s) => s.id === REPORT.frame)
      .map((s) => decodeFrame(s.data, count));
  }

  sendCount(): number {
    return this.sends.length;
  }

  private failure(): Error | undefined {
    if (this.gone) return new Error("device unplugged");
    if (Date.now() < this.busyUntil) return new Error("not responding");
    if (this.fail > 0) {
      this.fail--;
      return new Error("general error");
    }
    return undefined;
  }

  /**
   * Stores a report 5 in the frame as the firmware does: RGB on the wire
   * becomes GRB in the slot. The channel byte is ignored and slots of 8 or
   * more are dropped.
   */
  private applyLed(data: Uint8Array): void {
    const slot = data[1] ?? 0;
    if (slot >= FRAME_LEDS) return;
    let buf = this.reports.get(REPORT.frame);
    if (!buf) {
      buf = new Uint8Array(REPORT_LENGTH[6]);
      this.reports.set(REPORT.frame, buf);
    }
    buf[1 + slot * 3] = data[3] ?? 0;
    buf[2 + slot * 3] = data[2] ?? 0;
    buf[3 + slot * 3] = data[4] ?? 0;
  }
}
