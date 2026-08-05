import { describe, expect, it } from "vitest";
import { resolvePetCardSceneGeometry } from "../components/slime/slime-types";
import { layout, pageChrome, slimeUi } from "../theme/tokens";

function cardWidthForWindow(windowWidth: number): number {
  const contentWidth = Math.min(windowWidth, layout.readableMaxWidth);
  const gridWidth = Math.max(0, contentWidth - pageChrome.horizontalPadding * 2);
  return gridWidth * 0.32;
}

function homePaneWidth(windowWidth: number): number {
  const contentWidth = Math.min(windowWidth, layout.readableMaxWidth);
  const bodyWidth = Math.max(0, contentWidth - pageChrome.horizontalPadding * 2);
  return bodyWidth * 0.46;
}

function homeWidthFill(): number {
  const phonePane = homePaneWidth(360);
  const phoneSceneWidth =
    64 * 4 * slimeUi.vehicleSceneScale * slimeUi.homePetSceneDisplayScale;
  return phonePane > 0 ? Math.min(1, phoneSceneWidth / phonePane) : 1;
}

describe("resolvePetCardSceneGeometry", () => {
  const base = {
    baseDisplayScale: slimeUi.petSceneDisplayScale,
    baseSlotHeight: slimeUi.vehicleSceneSlotHeight,
    sceneScale: slimeUi.vehicleSceneScale,
  } as const;

  it("preserves the phone-authored scene size on an S23-class compact width", () => {
    const geometry = resolvePetCardSceneGeometry({
      ...base,
      cardWidth: cardWidthForWindow(360),
    });

    expect(geometry.displayScale).toBe(slimeUi.petSceneDisplayScale);
    expect(geometry.slotHeight).toBe(slimeUi.vehicleSceneSlotHeight);
    expect(geometry.sceneWidth).toBe(96);
  });

  it("grows the whole scene uniformly for a 1200-wide tablet three-column card", () => {
    const cardWidth = cardWidthForWindow(1200);
    const geometry = resolvePetCardSceneGeometry({
      ...base,
      cardWidth,
    });

    expect(geometry.displayScale).toBeGreaterThan(slimeUi.petSceneDisplayScale);
    expect(geometry.displayScale).toBe(0.75);
    expect(geometry.sceneWidth).toBeCloseTo(384 * 0.75, 5);
    expect(geometry.sceneWidth).toBeLessThanOrEqual(cardWidth + 1e-6);
    expect(geometry.slotHeight).toBeCloseTo(
      slimeUi.vehicleSceneSlotHeight * (0.75 / slimeUi.petSceneDisplayScale),
      5,
    );
    expect(geometry.sceneWidth / (geometry.displayScale * 384)).toBeCloseTo(1, 5);
  });

  it("never shrinks below the phone base scale or stretches only one axis", () => {
    const narrow = resolvePetCardSceneGeometry({
      ...base,
      cardWidth: 40,
    });
    const wide = resolvePetCardSceneGeometry({
      ...base,
      cardWidth: 300,
    });

    expect(narrow.displayScale).toBe(slimeUi.petSceneDisplayScale);
    expect(wide.displayScale).toBeGreaterThan(narrow.displayScale);
    expect(wide.slotHeight / narrow.slotHeight).toBeCloseTo(
      wide.displayScale / narrow.displayScale,
      5,
    );
    expect(wide.sceneWidth / narrow.sceneWidth).toBeCloseTo(
      wide.displayScale / narrow.displayScale,
      5,
    );
  });

  it("preserves the home representative scene on phone and grows it on tablet without distortion", () => {
    const widthFill = homeWidthFill();
    const phoneSceneWidth =
      64 * 4 * slimeUi.vehicleSceneScale * slimeUi.homePetSceneDisplayScale;

    const phone = resolvePetCardSceneGeometry({
      cardWidth: homePaneWidth(360),
      baseDisplayScale: slimeUi.homePetSceneDisplayScale,
      baseSlotHeight: slimeUi.homePetSceneHeight,
      sceneScale: slimeUi.vehicleSceneScale,
      widthFill,
    });
    const tablet = resolvePetCardSceneGeometry({
      cardWidth: homePaneWidth(1200),
      baseDisplayScale: slimeUi.homePetSceneDisplayScale,
      baseSlotHeight: slimeUi.homePetSceneHeight,
      sceneScale: slimeUi.vehicleSceneScale,
      widthFill,
    });

    expect(phone.displayScale).toBe(slimeUi.homePetSceneDisplayScale);
    expect(phone.sceneWidth).toBe(phoneSceneWidth);
    expect(phone.slotHeight).toBe(slimeUi.homePetSceneHeight);

    expect(tablet.displayScale).toBeGreaterThan(phone.displayScale);
    expect(tablet.sceneWidth).toBeLessThanOrEqual(homePaneWidth(1200) + 1e-6);
    expect(tablet.slotHeight / phone.slotHeight).toBeCloseTo(
      tablet.displayScale / phone.displayScale,
      5,
    );
    expect(tablet.sceneWidth / phone.sceneWidth).toBeCloseTo(
      tablet.displayScale / phone.displayScale,
      5,
    );
  });
});
