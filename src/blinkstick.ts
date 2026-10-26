/// <reference lib="esnext.disposable" preserve="true" />
import type { Color } from "./color.js";
import { invert, OFF, scale } from "./color.js";
import { BlinkStickError } from "./errors.js";
import type { Model } from "./models.js";
import { ledCount } from "./models.js";
import {
  decodeFrame,
  encodeFrame,
  encodeLed,
  REPORT,
  REPORT_LENGTH,
} from "./protocol.js";
import { createQueue } from "./queue.js";
import type { Transport } from "./transport.js";
import { assertColor, assertIndex } from "./validate.js";

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

/**
 * An open BlinkStick. Calls are queued and run one at a time, in call order, so
 * they are safe to fire without awaiting each. Two effects running at once on
 * one stick interleave their frames.
 */
export class BlinkStick<I extends BlinkStickInfo = BlinkStickInfo> {
  readonly info: I;
  readonly ledCount: number;
  /** Flips every channel written from now on to 255 - v, after the brightness limit. */
  inverted: boolean = false;

  #brightnessLimit = 255;
  #transport: Transport;
  #closed = false;
  readonly #run = createQueue();
  /** Last frame written, scaled and before flipping. */
  #lastFrame: Color[] | undefined;
  /** Set from Task 5 onwards, for reconnecting by name. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used from Task 5
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
    return this.#writeFrame(Array.from({ length: this.ledCount }, () => color));
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
    return this.#writeFrame(colors);
  }

  /**
   * Reads every LED back from the stick. Values are those stored on the stick,
   * so they reflect any brightness limit in force when they were written. With
   * `inverted` on they are flipped back.
   */
  async getFrame(): Promise<Color[]> {
    return this.#run(() => this.#readFrame());
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
    return this.#run(async () => {
      if (this.#lastFrame === undefined) {
        // Values on the device are already scaled, and reads undo any flip.
        this.#lastFrame = await this.#readFrame();
      }
      const scaled = scale(color, this.#brightnessLimit);
      const wire = this.inverted ? invert(scaled) : scaled;
      await this.#transfer("send", REPORT.led, (t) =>
        t.sendFeatureReport(REPORT.led, encodeLed(index, wire)),
      );
      this.#lastFrame[index] = scaled;
    });
  }

  /** Closes the stick, so that `await using` works. Present where the runtime defines the symbol. */
  declare [Symbol.asyncDispose]: () => Promise<void>;

  #assertOpen(): void {
    if (this.#closed) {
      throw new BlinkStickError("CLOSED", "blinkstick: the stick is closed");
    }
  }

  /** Scales, flips and sends a frame, then remembers it. */
  #writeFrame(colors: readonly Color[]): Promise<void> {
    const limit = this.#brightnessLimit;
    const inverted = this.inverted;
    return this.#run(async () => {
      const scaled = colors.map((c) => scale(c, limit));
      const wire = inverted ? scaled.map(invert) : scaled;
      await this.#transfer("send", REPORT.frame, (t) =>
        t.sendFeatureReport(REPORT.frame, encodeFrame(wire)),
      );
      this.#lastFrame = scaled;
    });
  }

  /** Reads report 6. Runs inside the queue. */
  async #readFrame(): Promise<Color[]> {
    const data = await this.#transfer("get", REPORT.frame, (t) =>
      t.receiveFeatureReport(REPORT.frame, REPORT_LENGTH[6]),
    );
    const frame = decodeFrame(data, this.ledCount);
    return this.inverted ? frame.map(invert) : frame;
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
