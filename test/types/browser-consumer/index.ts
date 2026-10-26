import { type BlinkStick, type Color, parseColor } from "@bawdo/blinkstick";
import { open } from "@bawdo/blinkstick/webhid";

const color: Color = parseColor("red");

export async function run(): Promise<void> {
  const stick: BlinkStick = await open({ name: "desk" });
  await stick.setAll(color);
  await stick[Symbol.asyncDispose]();
}
