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

describe("names", () => {
  test("roundTrip", async () => {
    const { stick, ft } = open("nano");
    await stick.setName("office");
    expect(ft.sendCount()).toBe(1);
    expect(ft.sends[0]?.id).toBe(2);
    expect(await stick.getName()).toBe("office");
  });

  test("wellFormedSurrogatePairRoundTrips", async () => {
    const { stick } = open("nano");
    await stick.setName("desk 🙂");
    expect(await stick.getName()).toBe("desk 🙂");
  });

  test("unsetIsEmpty", async () => {
    const { stick } = open("nano");
    expect(await stick.getName()).toBe("");
  });

  test("emptyClears", async () => {
    const { stick } = open("nano");
    await stick.setName("office");
    await stick.setName("");
    expect(await stick.getName()).toBe("");
  });

  test("utf8", async () => {
    const { stick } = open("nano");
    await stick.setName("büro ☕");
    expect(await stick.getName()).toBe("büro ☕");
  });

  test("limits", async () => {
    const { stick, ft } = open("nano");
    await stick.setName("x".repeat(32));
    const sent = ft.sendCount();
    await expect(stick.setName("x".repeat(33))).rejects.toThrow(RangeError);
    await expect(stick.setName("é".repeat(17))).rejects.toThrow(RangeError);
    expect(ft.sendCount()).toBe(sent);
  });

  test("rejectsInvalidNames", async () => {
    const { stick, ft } = open("nano");
    for (const name of ["a\0b", "bad \ud800 lone", "\udc00", 5, null]) {
      await expect(stick.setName(name as string)).rejects.toThrow(TypeError);
    }
    await expect(stick.setName("ok 😀")).resolves.toBeUndefined();
    expect(ft.sendCount()).toBe(1);
  });

  test("decodesInvalidBytesLeniently", async () => {
    const { stick, ft } = open("nano");
    ft.reports.set(2, Uint8Array.of(0x61, 0xff, 0x62));
    expect(await stick.getName()).toBe("a�b");
  });
});
