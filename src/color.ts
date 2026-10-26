import { cssColors } from "./color-names.js";

/** A colour with 8 bits per channel. */
export type Color = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/** Builds a frozen colour from three channels, with no range check. */
export function rgb(r: number, g: number, b: number): Color {
  return Object.freeze({ r, g, b });
}

/** All channels off. */
export const OFF: Color = rgb(0, 0, 0);

/** All channels at full. Internal, not exported from the package entry. */
export const WHITE: Color = rgb(255, 255, 255);

function invalid(input: string): TypeError {
  return new TypeError(`blinkstick: invalid colour ${JSON.stringify(input)}`);
}

function parseHex(input: string, hex: string): Color {
  let digits = hex;
  if (digits.length === 3) {
    digits = [...digits].map((d) => d + d).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(digits)) throw invalid(input);
  const n = Number.parseInt(digits, 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/**
 * Parses a colour in any of these forms:
 *
 * - hex "#rgb" or "#rrggbb", with or without the "#"
 * - "r,g,b" with decimal channels from 0 to 255
 * - a CSS colour name such as "cornflowerblue", in any case
 *
 * Throws a TypeError for anything else.
 */
export function parseColor(input: string): Color {
  const s = input.trim();
  if (s.startsWith("#")) return parseHex(s, s.slice(1));
  const named = Object.hasOwn(cssColors, s.toLowerCase())
    ? cssColors[s.toLowerCase()]
    : undefined;
  if (named) return named;
  const parts = s.split(",");
  if (parts.length === 1) {
    // No CSS name is made only of hex digits, so a bare hex code cannot
    // shadow a name.
    return parseHex(s, s);
  }
  if (parts.length !== 3) throw invalid(s);
  const v = parts.map((p) => {
    const t = p.trim();
    const n = /^[0-9]+$/.test(t) ? Number.parseInt(t, 10) : Number.NaN;
    if (!(n >= 0 && n <= 255)) throw invalid(s);
    return n;
  });
  return rgb(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
}

/** Caps each channel at limit, keeping the hue: floor(v * limit / 255). */
export function scale(color: Color, limit: number): Color {
  const f = (v: number): number => Math.floor((v * limit) / 255);
  return rgb(f(color.r), f(color.g), f(color.b));
}

/** Returns the colour with each channel flipped: 255 - v. */
export function invert(color: Color): Color {
  return rgb(255 - color.r, 255 - color.g, 255 - color.b);
}

/** Returns the colour as lower case "#rrggbb". */
export function toHex(color: Color): string {
  const h = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${h(color.r)}${h(color.g)}${h(color.b)}`;
}
