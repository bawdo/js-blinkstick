import { type BlinkStick, type Color, parseColor } from "@bawdo/blinkstick";
import { list, open } from "@bawdo/blinkstick/node";

const color: Color = parseColor("red");

export async function run(): Promise<void> {
  const infos = await list();
  const stick: BlinkStick = await open({ serial: infos[0]?.serial ?? "" });
  await stick.setAll(color);
  await stick[Symbol.asyncDispose]();
}
