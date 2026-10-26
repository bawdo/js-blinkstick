import type { Color } from "./color.js";
import { rgb } from "./color.js";

/** Six segments of 255 steps around the colour wheel. */
const HUES = 6 * 255;

/**
 * Returns a colour with each channel picked at random from 0 to 255. Many
 * results are muted or greyish; use randomVividColor for bright ones. Not
 * suitable for anything security related.
 */
export function randomColor(): Color {
  const ch = (): number => Math.floor(Math.random() * 256);
  return rgb(ch(), ch(), ch());
}

/**
 * Returns a fully saturated colour at full brightness with a random hue: one
 * channel is always 255 and another is always 0.
 */
export function randomVividColor(): Color {
  return hue(Math.floor(Math.random() * HUES));
}

/**
 * Returns the fully saturated colour at step h of the wheel, running red,
 * yellow, green, cyan, blue, magenta and back towards red. h must be an
 * integer in [0, 1530). Internal.
 */
export function hue(step: number): Color {
  const x = step % 255;
  switch (Math.floor(step / 255)) {
    case 0:
      return rgb(255, x, 0);
    case 1:
      return rgb(255 - x, 255, 0);
    case 2:
      return rgb(0, 255, x);
    case 3:
      return rgb(0, 255 - x, 255);
    case 4:
      return rgb(x, 0, 255);
    default:
      return rgb(255, 0, 255 - x);
  }
}
