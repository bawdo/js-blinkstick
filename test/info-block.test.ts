import { describe, expect, test } from "vitest";
import { BlinkStick, type BlinkStickInfo } from "../src/blinkstick.js";
import type { Model } from "../src/models.js";
import { FakeTransport } from "./fakes/fake-transport.js";

function open(model: Model): { stick: BlinkStick; ft: FakeTransport } {
  const ft = new FakeTransport();
  const info: BlinkStickInfo = {
    model,
    product: "BlinkStick",
    manufacturer: "Agile Innovative Ltd",
  };
  return { stick: new BlinkStick({ transport: ft, info }), ft };
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("info blocks", () => {
  test("roundTrip", async () => {
    const { stick } = open("square");
    await stick.setInfoBlock(1, text("office"));
    await stick.setInfoBlock(2, text("desk"));
    expect(await stick.getInfoBlock(1)).toEqual(text("office"));
    expect(await stick.getInfoBlock(2)).toEqual(text("desk"));
  });

  test("setSendsPaddedReport", async () => {
    const { stick, ft } = open("nano");
    await stick.setInfoBlock(2, text("hi"));
    expect(ft.sends).toHaveLength(1);
    const sent = ft.sends[0];
    expect(sent?.id).toBe(3);
    const want = new Uint8Array(32);
    want.set(text("hi"));
    expect(sent?.data).toEqual(want);
  });

  test("emptyBlockReadsEmpty", async () => {
    const { stick } = open("nano");
    expect(await stick.getInfoBlock(1)).toEqual(new Uint8Array(0));
  });

  test("fullBlock", async () => {
    const { stick } = open("nano");
    const data = new Uint8Array(32).fill(120);
    await stick.setInfoBlock(1, data);
    expect(await stick.getInfoBlock(1)).toEqual(data);
  });

  test("copiesDataAtCallTime", async () => {
    const { stick, ft } = open("nano");
    const data = text("abc");
    const pending = stick.setInfoBlock(1, data);
    data.fill(0x7a);
    await pending;
    expect(ft.sends[0]?.data.subarray(0, 3)).toEqual(text("abc"));
  });

  test("rejectsBadArguments", async () => {
    const { stick, ft } = open("nano");
    await expect(stick.setInfoBlock(1, new Uint8Array(33))).rejects.toThrow(
      RangeError,
    );
    for (const n of [0, 3, 1.0001, -1, Number.NaN]) {
      await expect(stick.getInfoBlock(n as 1)).rejects.toThrow(RangeError);
      await expect(
        stick.setInfoBlock(n as 1, new Uint8Array(0)),
      ).rejects.toThrow(RangeError);
    }
    for (const n of ["1", null, undefined, 1n]) {
      await expect(stick.getInfoBlock(n as unknown as 1)).rejects.toThrow(
        TypeError,
      );
    }
    await expect(
      stick.setInfoBlock(1, "abc" as unknown as Uint8Array),
    ).rejects.toThrow(TypeError);
    await expect(
      stick.setInfoBlock(1, [1, 2] as unknown as Uint8Array),
    ).rejects.toThrow(TypeError);
    expect(ft.sendCount()).toBe(0);
    expect(ft.gets).toBe(0);
  });
});
