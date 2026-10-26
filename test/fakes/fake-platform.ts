import type { BlinkStickInfo } from "../../src/blinkstick.js";
import type { Platform } from "../../src/discovery.js";
import { applyModelHint } from "../../src/discovery.js";
import type { Model } from "../../src/models.js";
import { detectFromDescriptor, detectFromSerial } from "../../src/models.js";
import { REPORT, REPORT_LENGTH } from "../../src/protocol.js";
import type { Identity } from "../../src/transport.js";
import type { FakeBackend, FakeHandle } from "./fake-backend.js";
import type { FakeTransport } from "./fake-transport.js";

export interface SerialInfo extends BlinkStickInfo {
  serial: string;
}

/** Node style: detection by serial and release, reconnect by serial. */
export function serialPlatform(
  backend: FakeBackend,
): Platform<FakeHandle, SerialInfo> {
  return {
    backend,
    toInfo: (identity: Identity, hint?: Model): SerialInfo => ({
      model: applyModelHint(
        detectFromSerial(identity.serial ?? "", identity.release ?? 0),
        hint,
      ),
      product: identity.product,
      manufacturer: identity.manufacturer,
      serial: identity.serial ?? "",
    }),
    key: (identity: Identity): string | undefined => identity.serial,
  };
}

/** Browser style: detection by descriptor, no key, so reconnect falls back. */
export function descriptorPlatform(
  backend: FakeBackend,
): Platform<FakeHandle, BlinkStickInfo> {
  return {
    backend,
    toInfo: (identity: Identity, hint?: Model): BlinkStickInfo => ({
      model: applyModelHint(
        detectFromDescriptor(identity.product, identity.featureReportIds ?? []),
        hint,
      ),
      product: identity.product,
      manufacturer: identity.manufacturer,
    }),
  };
}

/** Stores `name` in info block 1 of a fake stick, as setName would. */
export function nameStick(ft: FakeTransport, name: string): void {
  const buf = new Uint8Array(REPORT_LENGTH[2]);
  buf.set(new TextEncoder().encode(name));
  ft.reports.set(REPORT.info1, buf);
}
