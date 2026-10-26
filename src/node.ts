import type { BlinkStick, BlinkStickInfo } from "./blinkstick.js";
import type { NamedInfo, Platform } from "./discovery.js";
import { listNamed, list as listSticks, openStick } from "./discovery.js";
import { BlinkStickError } from "./errors.js";
import { detectFromSerial } from "./models.js";
import { hidBackend } from "./node/backend.js";
import type { Identity } from "./transport.js";

export * from "./index.js";

/** What Node knows about a stick that the browser does not. */
export interface NodeBlinkStickInfo extends BlinkStickInfo {
  serial: string;
  /** The part of the serial after the dash, such as "3.0". */
  version: string;
  /** USB bcdDevice. */
  release: number;
}

const platform: Platform<string, NodeBlinkStickInfo> = {
  backend: hidBackend,
  toInfo(identity: Identity): NodeBlinkStickInfo {
    const serial = identity.serial ?? "";
    const release = identity.release ?? 0;
    return {
      model: detectFromSerial(serial, release),
      product: identity.product,
      manufacturer: identity.manufacturer,
      serial,
      version: serial.split("-").slice(1).join("-"),
      release,
    };
  },
  // An empty serial must never match another stick's empty serial.
  key: (identity: Identity): string | undefined => identity.serial || undefined,
};

/**
 * Every attached stick, including unsupported models. Needs the optional
 * `node-hid` package installed.
 */
export function list(): Promise<NodeBlinkStickInfo[]>;
/** The same, with each stick's stored name and a `busy` flag. */
export function list(options: {
  names: true;
}): Promise<NamedInfo<NodeBlinkStickInfo>[]>;
export function list(options?: {
  names?: boolean;
}): Promise<NodeBlinkStickInfo[] | NamedInfo<NodeBlinkStickInfo>[]> {
  return options?.names ? listNamed(platform) : listSticks(platform);
}

/**
 * Opens the first stick, the one with this `serial`, or the one named `name`.
 * Passing both is a TypeError. If the stick is later unplugged, the next call
 * finds it again by serial and repaints the last frame. A stick with no serial
 * cannot be reconnected.
 */
export async function open(
  options: { serial?: string; name?: string } = {},
): Promise<BlinkStick<NodeBlinkStickInfo>> {
  const { serial, name } = options;
  if (serial !== undefined && name !== undefined) {
    throw new TypeError("blinkstick: pass a serial or a name, not both");
  }
  if (serial === "") {
    throw new BlinkStickError("NOT_FOUND", "blinkstick: empty serial");
  }
  if (serial !== undefined) {
    return openStick(platform, { match: (i) => i.serial === serial });
  }
  return openStick(platform, name === undefined ? {} : { name });
}
