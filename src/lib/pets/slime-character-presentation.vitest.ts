import { describe, expect, it } from "vitest";

import { SLIME_CATALOG, SLIME_SHOP_CATALOG } from "./catalog";
import { resolveSlimeCharacterPresentation } from "./slime-character-presentation";

const slime = SLIME_CATALOG[0]!;

function catalogItem(key: string) {
  const item = SLIME_SHOP_CATALOG.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`missing slime catalog fixture: ${key}`);
  return item;
}

describe("resolveSlimeCharacterPresentation", () => {
  it("keeps an unequipped pet on the base idle canvas", () => {
    const result = resolveSlimeCharacterPresentation({ slime, items: [] });

    expect(result.resolvedAction).toBe("idle");
    expect(result.floor).toBe("none");
    expect(result.hasScene).toBe(false);
    expect(result.repeat).toBe(false);
    expect(result.alt).toBe(`${slime.nameKo} 미리보기`);
  });

  it("maps the trampoline vehicle to the shared floor interaction", () => {
    const result = resolveSlimeCharacterPresentation({
      slime,
      items: [catalogItem("slime-blue-trampoline")],
    });

    expect(result.floor).toBe("trampoline");
    expect(result.renderedVehicle).toBeNull();
    expect(result.resolvedAction).toBe("floor-interaction");
    expect(result.hasScene).toBe(true);
  });

  it("composes drinks as looping prop actions instead of replacement sprites", () => {
    const drink = SLIME_SHOP_CATALOG.find(
      (candidate) => candidate.category === "drink",
    );
    if (!drink) throw new Error("missing drink fixture");

    const result = resolveSlimeCharacterPresentation({
      slime,
      items: [drink],
    });

    expect(result.propAction?.kind).toBe("drink");
    expect(result.resolvedAction).toBe("drink");
    expect(result.itemSpritePath).toBeUndefined();
    expect(result.repeat).toBe(true);
  });

  it("defaults scene backgrounds to the host full-bleed layer", () => {
    const background = SLIME_SHOP_CATALOG.find(
      (candidate) =>
        candidate.category === "background" && candidate.floor === null,
    );
    if (!background) throw new Error("missing scene background fixture");

    const result = resolveSlimeCharacterPresentation({
      slime,
      items: [background],
    });

    expect(result.sceneBackgroundPath).toBeTruthy();
    expect(result.useHostBackground).toBe(true);
    expect(result.renderBackgroundInSprite).toBe(false);
    expect(result.hasScene).toBe(true);
  });
});
