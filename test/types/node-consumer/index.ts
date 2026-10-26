import {
  type BlinkOptions,
  type BlinkStick,
  type Color,
  type MorphOptions,
  type PulseOptions,
  parseColor,
} from "@bawdo/blinkstick";
import { list, open } from "@bawdo/blinkstick/node";

const color: Color = parseColor("red");
const blink: BlinkOptions = { period: 200, iterations: 2 };
const pulse: PulseOptions = { duration: 400 };
const morph: MorphOptions = { duration: 100 };

export async function run(): Promise<void> {
  const infos = await list();
  const stick: BlinkStick = await open({ serial: infos[0]?.serial ?? "" });
  await stick.setAll(color);
  await stick.blink(color, blink);
  await stick.pulse(color, pulse);
  await stick.morph(color, morph);
  await stick[Symbol.asyncDispose]();
}
