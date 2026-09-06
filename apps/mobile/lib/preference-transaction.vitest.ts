import { describe, expect, it, vi } from "vitest";
import { commitPreferenceChange } from "./preference-transaction";

describe("menu preference persistence", () => {
  it("restores the last persisted order when saving rejects", async () => {
    const previous = ["home", "boards", "more"];
    const next = ["boards", "home", "more"];
    const apply = vi.fn();
    const save = vi.fn(async () => { throw new Error("storage unavailable"); });
    expect(await commitPreferenceChange({ previous, next, apply, save })).toBe(false);
    expect(save).toHaveBeenCalledWith(next);
    expect(apply.mock.calls).toEqual([[next], [previous]]);
  });
  it("commits only after the persistent write completes", async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const apply = vi.fn();
    const operation = commitPreferenceChange({ previous: ["home"], next: ["boards"], apply, save });
    expect(apply.mock.calls).toEqual([[["boards"]]]);
    finish();
    expect(await operation).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
