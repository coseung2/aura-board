import { describe, expect, it } from "vitest";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createTrailingRefreshRunner", () => {
  it("runs one trailing refresh when invalidated during an in-flight refresh", async () => {
    const first = deferred();
    const second = deferred();
    let calls = 0;
    const runner = createTrailingRefreshRunner(async () => {
      calls += 1;
      await (calls === 1 ? first.promise : second.promise);
    });

    const current = runner.run();
    void runner.run();
    void runner.run();
    expect(calls).toBe(1);

    first.resolve();
    await current;
    await flushMicrotasks();
    expect(calls).toBe(2);

    second.resolve();
    await flushMicrotasks();
    expect(runner.isRunning()).toBe(false);
  });

  it("allows a fresh reconciliation after the previous run settles", async () => {
    let calls = 0;
    const runner = createTrailingRefreshRunner(async () => {
      calls += 1;
    });

    await runner.run();
    await runner.run();

    expect(calls).toBe(2);
  });

  it("recovers after a refresh throws", async () => {
    let calls = 0;
    const runner = createTrailingRefreshRunner(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
    });

    await runner.run();
    await runner.run();

    expect(calls).toBe(2);
    expect(runner.isRunning()).toBe(false);
  });
});
