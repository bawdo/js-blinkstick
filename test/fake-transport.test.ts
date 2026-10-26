import { describe, expect, test } from "vitest";
import { encodeLed, REPORT } from "../src/protocol.js";
import {
  FakeBackend,
  type FakeHandle,
  nanoInfo,
  threeSticks,
} from "./fakes/fake-backend.js";
import { FakeTransport } from "./fakes/fake-transport.js";

async function firstCandidate(b: FakeBackend) {
  const c = (await b.list())[0];
  if (!c) throw new Error("no candidate");
  return c;
}

async function firstHandle(b: FakeBackend): Promise<FakeHandle> {
  return (await firstCandidate(b)).handle;
}

describe("FakeTransport", () => {
  test("a report 5 lands in the frame as GRB", async () => {
    const t = new FakeTransport();
    await t.sendFeatureReport(REPORT.led, encodeLed(1, { r: 1, g: 2, b: 3 }));
    expect(t.frame(8)[1]).toEqual({ r: 1, g: 2, b: 3 });
  });

  test("a report 5 slot of 8 or more is dropped", async () => {
    const t = new FakeTransport();
    await t.sendFeatureReport(REPORT.led, encodeLed(8, { r: 1, g: 2, b: 3 }));
    expect(t.frame(8).every((c) => c.r + c.g + c.b === 0)).toBe(true);
  });

  test("mode starts as 2 and unknown reports read as zeros", async () => {
    const t = new FakeTransport();
    expect([...(await t.receiveFeatureReport(REPORT.mode, 1))]).toEqual([2]);
    expect([...(await t.receiveFeatureReport(REPORT.info1, 3))]).toEqual([
      0, 0, 0,
    ]);
  });

  test("fail counts down, failed sends are still recorded", async () => {
    const t = new FakeTransport();
    t.fail = 1;
    await expect(
      t.sendFeatureReport(REPORT.mode, Uint8Array.of(1)),
    ).rejects.toThrow();
    await t.sendFeatureReport(REPORT.mode, Uint8Array.of(1));
    expect(t.sendCount()).toBe(2);
    expect(t.reports.get(REPORT.mode)).toEqual(Uint8Array.of(1));
  });

  test("gone rejects every transfer and close sets closed", async () => {
    const t = new FakeTransport();
    t.gone = true;
    await expect(t.receiveFeatureReport(REPORT.mode, 1)).rejects.toThrow();
    expect(t.gets).toBe(1);
    await t.close();
    expect(t.closed).toBe(true);
  });
});

describe("FakeBackend", () => {
  test("lists candidates and opens their transports", async () => {
    const { backend, transports } = threeSticks();
    const list = await backend.list();
    expect(list).toHaveLength(3);
    expect(await backend.open(list[0]?.handle as FakeHandle)).toBe(
      transports.nano,
    );
  });

  test("unplug makes open reject, replug restores a fresh transport", async () => {
    const t = new FakeTransport();
    const b = new FakeBackend([{ identity: nanoInfo, transport: t }]);
    const h = await firstHandle(b);
    await t.sendFeatureReport(REPORT.info2, Uint8Array.of(7));
    await t.sendFeatureReport(REPORT.led, encodeLed(0, { r: 9, g: 9, b: 9 }));
    b.unplug(0);
    expect(t.gone).toBe(true);
    await expect(b.open(h)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const fresh = b.replug(0);
    expect(fresh).not.toBe(t);
    expect(await b.open(h)).toBe(fresh);
    expect(fresh.reports.get(REPORT.info2)).toEqual(Uint8Array.of(7));
    expect(fresh.frame(1)[0]).toEqual({ r: 0, g: 0, b: 0 });
  });

  test("replug with newHandle replaces the handle", async () => {
    const b = new FakeBackend([{ identity: nanoInfo }]);
    const before = await firstHandle(b);
    b.replug(0);
    expect(await firstHandle(b)).toBe(before);
    b.replug(0, { newHandle: true });
    expect(await firstHandle(b)).not.toBe(before);
  });

  test("busy rejects open without making the transport gone", async () => {
    const b = new FakeBackend([{ identity: nanoInfo }]);
    const l = await firstCandidate(b);
    b.busy(0);
    await expect(b.open(l.handle)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(b.devices[0]?.transport.gone).toBe(false);
  });
});
