import { describe, expect, it } from "vitest";
import {
  prioritizeEquippedSlimeItems,
  setSlimeItemHidden,
  visibleEquippedSlimeItemKeys,
} from "./slime-item-visibility";

describe("slime item visibility", () => {
  it("places equipped items first without disturbing the remaining order", () => {
    const items = ["first", "equipped-a", "middle", "equipped-b", "last"].map((key) => ({ key }));
    expect(prioritizeEquippedSlimeItems(items, ["equipped-b", "equipped-a"]).map(({ key }) => key))
      .toEqual(["equipped-a", "equipped-b", "first", "middle", "last"]);
    expect(items.map(({ key }) => key)).toEqual(["first", "equipped-a", "middle", "equipped-b", "last"]);
  });

  it("filters hidden visuals without mutating equipped keys", () => {
    const equipped = ["vehicle", "hat", "ball"];
    expect(visibleEquippedSlimeItemKeys(equipped, ["hat", "ball"])).toEqual(["vehicle"]);
    expect(equipped).toEqual(["vehicle", "hat", "ball"]);
  });

  it("updates one pet without changing another pet's hidden items", () => {
    const current = { blue: ["hat"], red: ["vehicle"] } as const;
    const next = setSlimeItemHidden(current, "blue", "ball", true);
    expect(next).toEqual({ blue: ["hat", "ball"], red: ["vehicle"] });
    expect(setSlimeItemHidden(next, "blue", "hat", false)).toEqual({
      blue: ["ball"],
      red: ["vehicle"],
    });
  });
});
