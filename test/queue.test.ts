import { describe, expect, test } from "vitest";
import { createQueue } from "../src/queue.js";

describe("createQueue", () => {
  test("runs tasks one at a time in call order", async () => {
    const run = createQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      run(task("a", 10)),
      run(task("b", 0)),
      run(task("c", 5)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual([
      "start a",
      "end a",
      "start b",
      "end b",
      "start c",
      "end c",
    ]);
  });

  test("a rejection does not stop later tasks", async () => {
    const run = createQueue();
    const failed = run(() => Promise.reject(new Error("boom")));
    const next = run(() => Promise.resolve(7));
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe(7);
  });

  test("a task that throws synchronously rejects and the queue carries on", async () => {
    const run = createQueue();
    const failed = run(() => {
      throw new Error("sync");
    });
    await expect(failed).rejects.toThrow("sync");
    await expect(run(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
