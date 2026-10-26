/** A supported BlinkStick product, or 'unknown'. */
export type Model = "nano" | "square" | "unknown";

/** The device's LED output mode, stored in EEPROM and read with report 4. */
export type Mode = "rgb" | "rgb-inverse" | "ws2812" | "ws2812-mirror";

const MODES: readonly Mode[] = [
  "rgb",
  "rgb-inverse",
  "ws2812",
  "ws2812-mirror",
];

/** Maps a mode name to its device byte (0 to 3). */
export function modeToByte(mode: Mode): number {
  return MODES.indexOf(mode);
}

/** Maps a device byte to its mode name, or returns the byte if it has none. */
export function byteToMode(n: number): Mode | number {
  return MODES[n] ?? n;
}

type ModelRow = {
  readonly leds: number;
  readonly modes: readonly Mode[];
  /** Serial major version, the "3" in "BS072777-3.0". */
  readonly major: string;
  /** USB bcdDevice. */
  readonly release: number;
};

// Modes 0 and 1 are for the BlinkStick Pro's RGB outputs, and a Nano set to
// mode 1 goes dark. Upstream libraries map bcdDevice 0x0201 to the Strip, but
// a Square (BS073788-3.1) reports 0x0201 too, so the Strip may share it.
const WS_MODES: readonly Mode[] = ["ws2812", "ws2812-mirror"];

const MODELS: Readonly<Record<Exclude<Model, "unknown">, ModelRow>> = {
  nano: { leds: 2, modes: WS_MODES, major: "3", release: 0x0202 },
  square: { leds: 8, modes: WS_MODES, major: "3", release: 0x0201 },
};

/** The known models, in the order `detectFromSerial` tries them. */
export const MODEL_NAMES: readonly Exclude<Model, "unknown">[] = Object.keys(
  MODELS,
) as Exclude<Model, "unknown">[];

/** The part of a serial after the first dash, such as "3.0", or "". */
export function serialVersion(serial: string): string {
  return serial.split("-").slice(1).join("-");
}

/** Addressable LEDs on channel 0. Zero for an unknown model. */
export function ledCount(model: Model): number {
  return model === "unknown" ? 0 : MODELS[model].leds;
}

/** Whether setting `mode` is allowed on `model`. */
export function supportsMode(model: Model, mode: Mode): boolean {
  return model !== "unknown" && MODELS[model].modes.includes(mode);
}

/** Identifies a model from its serial (such as "BS072777-3.0") and bcdDevice. */
export function detectFromSerial(serial: string, release: number): Model {
  const major = serialVersion(serial).split(".")[0];
  for (const name of MODEL_NAMES) {
    const row = MODELS[name];
    if (row.major === major && row.release === release) return name;
  }
  return "unknown";
}

/**
 * Identifies a model in the browser, where there is no serial. The product
 * "BlinkStick Nano" is a Nano. The product "BlinkStick" with feature report 10
 * is a Square. This is weaker than the serial rule, because other BlinkStick
 * models also report "BlinkStick".
 */
export function detectFromDescriptor(
  product: string,
  featureReportIds: readonly number[],
): Model {
  if (product === "BlinkStick Nano") return "nano";
  if (product === "BlinkStick" && featureReportIds.includes(10))
    return "square";
  return "unknown";
}
