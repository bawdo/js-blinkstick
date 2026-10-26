/// <reference lib="esnext.disposable" preserve="true" />
import type { Color } from "./color.js";
import { invert, OFF, scale } from "./color.js";
import { BlinkStickError } from "./errors.js";
import type { Mode, Model } from "./models.js";
import { byteToMode, ledCount, modeToByte, supportsMode } from "./models.js";
import {
  decodeFrame,
  encodeFrame,
  encodeLed,
  REPORT,
  REPORT_LENGTH,
} from "./protocol.js";
import { createQueue } from "./queue.js";
import type { Transport } from "./transport.js";
import { assertColor, assertIndex, assertInfoBlock } from "./validate.js";

/** What the library knows about a stick without opening a report. */
export interface BlinkStickInfo {
  model: Model;
  product: string;
  manufacturer: string;
}

export interface StickOptions<I extends BlinkStickInfo> {
  transport: Transport;
  info: I;
  /** Reopens the stick after it is unplugged. Used from Task 7 onwards. */
  reopen?: (knownName: string | undefined) => Promise<Transport>;
}

/** Covers the firmware being busy straight after a write, and flaky macOS sets. */
const TRANSFER_ATTEMPTS = 3;

const INFO_BLOCK_SIZE = REPORT_LENGTH[2];
/** Names live in info block 1, as the official BlinkStick tools do. */
const NAME_BLOCK = 1;
const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function infoReportId(block: 1 | 2): number {
  return block === 1 ? REPORT.info1 : REPORT.info2;
}

/**
 * An open BlinkStick. Calls are queued and run one at a time, in call order, so
 * they are safe to fire without awaiting each. Two effects running at once on
 * one stick interleave their frames.
 */
export class BlinkStick<I extends BlinkStickInfo = BlinkStickInfo> {
  readonly info: I;
  readonly ledCount: number;
  /**
   * Flips every channel written from now on to 255 - v, after the brightness
   * limit, for LEDs wired so that 255 means off. Reads flip back, so they return
   * what was written. It does not repaint the LEDs, so set it before setting
   * them.
   */
  inverted: boolean = false;

  #brightnessLimit = 255;
  #transport: Transport;
  #closed = false;
  readonly #run = createQueue();
  /** Last frame written, scaled and before flipping. */
  #lastFrame: Color[] | undefined;
  /** Last name read or written, for reconnecting by name. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read by the reconnect in Task 7
  #knownName: string | undefined;
  readonly #reopen:
    | ((knownName: string | undefined) => Promise<Transport>)
    | undefined;

  /** @internal */
  constructor(options: StickOptions<I>) {
    this.#transport = options.transport;
    this.#reopen = options.reopen;
    this.info = options.info;
    this.ledCount = ledCount(options.info.model);
  }

  /**
   * Caps every channel written from now on, scaling each as v * limit / 255.
   * An integer from 0 to 255, where the default 255 means no limit. Reads
   * return the scaled values stored on the stick.
   */
  get brightnessLimit(): number {
    return this.#brightnessLimit;
  }

  set brightnessLimit(limit: number) {
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > 255
    ) {
      throw new RangeError(
        `blinkstick: brightnessLimit must be an integer from 0 to 255, got ${String(limit)}`,
      );
    }
    this.#brightnessLimit = limit;
  }

  /** Releases the stick. A second call rejects with CLOSED. */
  close(): Promise<void> {
    return this.#run(async () => {
      this.#assertOpen();
      this.#closed = true;
      await this.#transport.close();
    });
  }

  /** Sets every LED to `color`. */
  async setAll(color: Color): Promise<void> {
    assertColor(color);
    return this.#writeFrame(
      Array.from({ length: this.ledCount }, () => this.#scaled(color)),
    );
  }

  /** Turns every LED off. */
  async off(): Promise<void> {
    return this.setAll(OFF);
  }

  /** Sets every LED at once. `colors.length` must equal `ledCount`. */
  async setFrame(colors: readonly Color[]): Promise<void> {
    if (!Array.isArray(colors)) {
      throw new TypeError("blinkstick: setFrame expects an array of colours");
    }
    if (colors.length !== this.ledCount) {
      throw new RangeError(
        `blinkstick: frame has ${colors.length} colours, this stick has ${this.ledCount} LEDs`,
      );
    }
    for (const c of colors) assertColor(c);
    return this.#writeFrame(colors.map((c) => this.#scaled(c)));
  }

  /**
   * Reads every LED back from the stick. Values are those stored on the stick,
   * so they reflect any brightness limit in force when they were written. With
   * `inverted` on they are flipped back.
   */
  async getFrame(): Promise<Color[]> {
    const inverted = this.inverted;
    return this.#run(() => this.#readFrame(inverted));
  }

  /** Reads LED `index` back from the stick, as `getFrame` does. */
  async getLed(index: number): Promise<Color> {
    assertIndex(index, this.ledCount);
    const frame = await this.getFrame();
    return frame[index] ?? OFF;
  }

  /**
   * Sets LED `index` to `color` and leaves the others as they are. Sends one
   * report 5. The first call on a stick that has written nothing also reads the
   * frame back once, so a reconnect can repaint the other LEDs.
   */
  async setLed(index: number, color: Color): Promise<void> {
    assertIndex(index, this.ledCount);
    assertColor(color);
    const scaled = this.#scaled(color);
    const inverted = this.inverted;
    return this.#run(async () => {
      if (this.#lastFrame === undefined) {
        // Values on the device are already scaled, and reads undo any flip.
        this.#lastFrame = await this.#readFrame(inverted);
      }
      const wire = inverted ? invert(scaled) : scaled;
      await this.#transfer("send", REPORT.led, (t) =>
        t.sendFeatureReport(REPORT.led, encodeLed(index, wire)),
      );
      this.#lastFrame[index] = scaled;
    });
  }

  /**
   * Reads user data block 1 or 2 from the stick's EEPROM, with trailing NUL
   * bytes removed. Data that ends in NUL bytes does not round-trip.
   */
  async getInfoBlock(block: 1 | 2): Promise<Uint8Array> {
    assertInfoBlock(block);
    return this.#run(() => this.#readInfoBlock(block));
  }

  /**
   * Writes up to 32 bytes to user data block 1 or 2, zero padded. This writes
   * EEPROM, which wears with use, so do not call it in a loop.
   */
  async setInfoBlock(block: 1 | 2, data: Uint8Array): Promise<void> {
    assertInfoBlock(block);
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("blinkstick: info block data must be a Uint8Array");
    }
    if (data.length > INFO_BLOCK_SIZE) {
      throw new RangeError(
        `blinkstick: info block data is ${data.length} bytes, max ${INFO_BLOCK_SIZE}`,
      );
    }
    const copy = data.slice();
    return this.#run(() => this.#writeInfoBlock(block, copy));
  }

  /** Reads the name stored in info block 1, or "" if none is set. */
  async getName(): Promise<string> {
    return this.#run(async () => {
      const bytes = await this.#readInfoBlock(NAME_BLOCK);
      const name = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      this.#knownName = name;
      return name;
    });
  }

  /**
   * Stores `name` in info block 1. It must be a string of at most 32 UTF-8
   * bytes with no NUL characters or lone surrogates. "" clears the name. This
   * writes EEPROM, which wears with use, so do not call it in a loop.
   */
  async setName(name: string): Promise<void> {
    if (typeof name !== "string") {
      throw new TypeError("blinkstick: name must be a string");
    }
    if (name.includes("\0") || LONE_SURROGATE.test(name)) {
      throw new TypeError(
        "blinkstick: name must be valid UTF-8 without NUL characters",
      );
    }
    const bytes = new TextEncoder().encode(name);
    if (bytes.length > INFO_BLOCK_SIZE) {
      throw new RangeError(
        `blinkstick: name is ${bytes.length} bytes, max ${INFO_BLOCK_SIZE}`,
      );
    }
    return this.#run(async () => {
      await this.#writeInfoBlock(NAME_BLOCK, bytes);
      this.#knownName = name;
    });
  }

  /** Reads the LED output mode, as a name or the raw number if it has none. */
  async getMode(): Promise<Mode | number> {
    return this.#run(async () => byteToMode(await this.#readMode()));
  }

  /**
   * Switches the LED output mode. Rejects with UNSUPPORTED_MODE when the model
   * forbids `mode`, which is every mode on an unknown model. Skips the write
   * when the stick is already in `mode`. This writes EEPROM, which wears with
   * use, so call it once and not in a loop.
   */
  async setMode(mode: Mode): Promise<void> {
    const byte = modeToByte(mode);
    if (typeof mode !== "string" || byte < 0) {
      throw new TypeError(
        `blinkstick: unknown mode ${String(mode)}, expected rgb, rgb-inverse, ws2812 or ws2812-mirror`,
      );
    }
    const { model } = this.info;
    if (!supportsMode(model, mode)) {
      throw new BlinkStickError(
        "UNSUPPORTED_MODE",
        `blinkstick: mode ${mode} is not supported on model ${model}`,
      );
    }
    return this.#run(async () => {
      if ((await this.#readMode()) === byte) return;
      await this.#transfer("send", REPORT.mode, (t) =>
        t.sendFeatureReport(REPORT.mode, Uint8Array.of(byte)),
      );
    });
  }

  /** Closes the stick, so that `await using` works. Present where the runtime defines the symbol. */
  declare [Symbol.asyncDispose]: () => Promise<void>;

  #assertOpen(): void {
    if (this.#closed) {
      throw new BlinkStickError("CLOSED", "blinkstick: the stick is closed");
    }
  }

  /**
   * Settings and caller data are captured when a method is called, after
   * validation, never when its queued task runs. This copies and scales a
   * validated colour with the brightness limit in force now.
   */
  #scaled(color: Color): Color {
    return scale(color, this.#brightnessLimit);
  }

  /** Flips (as of this call) and sends a scaled frame, then remembers it. */
  #writeFrame(scaled: Color[]): Promise<void> {
    const inverted = this.inverted;
    return this.#run(async () => {
      const wire = inverted ? scaled.map(invert) : scaled;
      await this.#transfer("send", REPORT.frame, (t) =>
        t.sendFeatureReport(REPORT.frame, encodeFrame(wire)),
      );
      this.#lastFrame = scaled;
    });
  }

  /** Reads an info block, trimmed of trailing NULs. Runs inside the queue. */
  async #readInfoBlock(block: 1 | 2): Promise<Uint8Array> {
    const id = infoReportId(block);
    const data = await this.#transfer("get", id, (t) =>
      t.receiveFeatureReport(id, INFO_BLOCK_SIZE),
    );
    let end = data.length;
    while (end > 0 && data[end - 1] === 0) end--;
    return data.slice(0, end);
  }

  /** Writes an info block, zero padded. Runs inside the queue. */
  async #writeInfoBlock(block: 1 | 2, data: Uint8Array): Promise<void> {
    const id = infoReportId(block);
    const padded = new Uint8Array(INFO_BLOCK_SIZE);
    padded.set(data);
    await this.#transfer("send", id, (t) => t.sendFeatureReport(id, padded));
  }

  /** Reads report 4. Runs inside the queue. */
  async #readMode(): Promise<number> {
    const data = await this.#transfer("get", REPORT.mode, (t) =>
      t.receiveFeatureReport(REPORT.mode, REPORT_LENGTH[4]),
    );
    return data[0] ?? 0;
  }

  /** Reads report 6, undoing the flip if `inverted`. Runs inside the queue. */
  async #readFrame(inverted: boolean): Promise<Color[]> {
    const data = await this.#transfer("get", REPORT.frame, (t) =>
      t.receiveFeatureReport(REPORT.frame, REPORT_LENGTH[6]),
    );
    const frame = decodeFrame(data, this.ledCount);
    return inverted ? frame.map(invert) : frame;
  }

  /**
   * Runs `fn` against the transport, up to three attempts. Must be called from
   * inside the queue. Rejects with CLOSED, sending nothing, once closed.
   */
  async #transfer<T>(
    op: "send" | "get",
    reportId: number,
    fn: (transport: Transport) => Promise<T>,
  ): Promise<T> {
    this.#assertOpen();
    let failure: unknown;
    for (let attempt = 0; attempt < TRANSFER_ATTEMPTS; attempt++) {
      try {
        return await fn(this.#transport);
      } catch (error) {
        failure = error;
      }
    }
    throw new Error(
      `blinkstick: ${op} report ${reportId} failed after ${TRANSFER_ATTEMPTS} attempts`,
      { cause: failure },
    );
  }
}

// Defined only where the runtime has the symbol, so that older runtimes do not
// get a method named "undefined". The class body declares the type.
if (typeof Symbol.asyncDispose === "symbol") {
  Object.defineProperty(BlinkStick.prototype, Symbol.asyncDispose, {
    value: function asyncDispose(this: BlinkStick): Promise<void> {
      return this.close();
    },
    writable: true,
    configurable: true,
  });
}
