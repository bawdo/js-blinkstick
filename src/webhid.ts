/// <reference types="w3c-web-hid" preserve="true" />
import type { BlinkStick, BlinkStickInfo } from "./blinkstick.js";
import type { NamedInfo, Platform } from "./discovery.js";
import {
  applyModelHint,
  listNamed,
  list as listSticks,
  openStick,
  wrapHandle,
} from "./discovery.js";
import { BlinkStickError } from "./errors.js";
import type { Model } from "./models.js";
import { detectFromDescriptor } from "./models.js";
import type { Identity } from "./transport.js";
import {
  candidatesOf,
  FILTERS,
  identityOf,
  isBlinkStick,
  webhidBackend,
} from "./webhid/backend.js";

export * from "./index.js";

/**
 * What the browser knows about a stick. There is no `serial`, `version` or
 * `release`, because WebHID exposes none of them.
 */
export interface WebHidBlinkStickInfo extends BlinkStickInfo {
  /** Always "" in the browser: WebHID exposes no manufacturer string. */
  manufacturer: string;
}

/** Every function takes the `HID` object to use, for tests and service workers. */
export interface HidOption {
  /** Defaults to `navigator.hid`, read at call time. */
  hid?: HID;
}

/** Options for `open`. */
export interface OpenOptions extends HidOption {
  /** Opens the one paired stick whose stored name is exactly this. */
  name?: string;
  /**
   * The model to assume when detection says 'unknown'. It is used only then.
   * A hint that disagrees with a detected model rejects with
   * UNSUPPORTED_MODEL, naming both. Without a hint, a stick that detection
   * cannot place is refused as an unsupported model.
   */
  model?: Model;
}

/** Options for `fromHIDDevice`. */
export interface FromHIDDeviceOptions extends HidOption {
  /** The model to assume when detection says 'unknown'. As for `open`. */
  model?: Model;
}

function resolveHid(options: HidOption | undefined): HID {
  const hid = options?.hid ?? globalThis.navigator?.hid;
  if (hid === undefined) {
    throw new Error(
      "blinkstick: WebHID is unavailable: it needs Chrome or Edge and a secure context",
    );
  }
  return hid;
}

/**
 * The browser platform for one `HID` object. Detection is by product string
 * and descriptor, which is weaker than Node's serial rule, so `model` hints
 * fill the gap. There is no key: reconnect matches by device, then name, then
 * model. `owned` is a device the caller handed over, which is closed on close.
 */
function platformFor(
  hid: HID,
  owned?: HIDDevice,
): Platform<HIDDevice, WebHidBlinkStickInfo> {
  return {
    backend: webhidBackend(hid, owned),
    toInfo(identity: Identity, hint?: Model): WebHidBlinkStickInfo {
      const detected = detectFromDescriptor(
        identity.product,
        identity.featureReportIds ?? [],
      );
      return {
        model: applyModelHint(detected, hint),
        product: identity.product,
        manufacturer: identity.manufacturer,
      };
    },
  };
}

/**
 * Shows Chrome's picker filtered to BlinkSticks and returns info for the
 * sticks chosen. It needs a user gesture (such as a click) in a visible page,
 * so it does not work from an extension popup or a service worker. Pairing
 * persists, so later `list` and `open` calls see the stick without it.
 */
export async function pair(
  options?: HidOption,
): Promise<WebHidBlinkStickInfo[]> {
  const hid = resolveHid(options);
  const p = platformFor(hid);
  const chosen = await hid.requestDevice({ filters: FILTERS });
  return candidatesOf(chosen).map((c) => p.toInfo(c.identity));
}

/**
 * Every paired, plugged in stick, including unsupported models. Sticks that
 * were never paired do not appear: call `pair` first.
 */
export function list(options?: HidOption): Promise<WebHidBlinkStickInfo[]>;
/** The same, with each stick's stored name and a `busy` flag. */
export function list(
  options: HidOption & { names: true },
): Promise<NamedInfo<WebHidBlinkStickInfo>[]>;
export async function list(
  options?: HidOption & { names?: boolean },
): Promise<WebHidBlinkStickInfo[] | NamedInfo<WebHidBlinkStickInfo>[]> {
  const p = platformFor(resolveHid(options));
  return options?.names ? listNamed(p) : listSticks(p);
}

/**
 * Opens the first paired stick, or the one named `name`. Rejects with
 * NOT_FOUND if there is none. If the stick is later unplugged, the next call
 * reopens it by matching the same device, then its stored name, then its model.
 * A device that was already open when the stick opened it stays open after
 * `close()`; one this opened is closed.
 */
export async function open(
  options: OpenOptions = {},
): Promise<BlinkStick<WebHidBlinkStickInfo>> {
  const { name, model } = options;
  return openStick(platformFor(resolveHid(options)), {
    ...(name === undefined ? {} : { name }),
    ...(model === undefined ? {} : { hint: model }),
  });
}

/**
 * Wraps a `HIDDevice` the caller already has, for code that does its own
 * pairing. It opens the device if it is not open yet. The `hid` object is
 * still needed, to watch for disconnects and to find the stick again. A
 * device without the BlinkStick vendor and product IDs, or one of an
 * unsupported model, is refused with UNSUPPORTED_MODEL before it is opened.
 *
 * The stick takes ownership of the `HIDDevice`: calling `close()` on the stick
 * closes the caller's device, so do not keep using it.
 */
export async function fromHIDDevice(
  device: HIDDevice,
  options: FromHIDDeviceOptions = {},
): Promise<BlinkStick<WebHidBlinkStickInfo>> {
  const hid = resolveHid(options);
  if (!isBlinkStick(device)) {
    throw new BlinkStickError(
      "UNSUPPORTED_MODEL",
      `blinkstick: ${device.productName} is not a BlinkStick (${hex(device.vendorId)}:${hex(device.productId)})`,
    );
  }
  return wrapHandle(
    platformFor(hid, device),
    device,
    identityOf(device),
    options.model,
  );
}

function hex(id: number): string {
  return id.toString(16).padStart(4, "0");
}
