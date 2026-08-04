import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./OfficialSlimeSprite.module.css";

describe("OfficialSlimeSprite", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances idle frames using the imported duration metadata", () => {
    vi.useFakeTimers();
    const { getByRole } = render(
      <OfficialSlimeSprite slimeColor="blue" action="idle" />,
    );
    const sprite = getByRole("img");

    expect(sprite.getAttribute("data-frame-index")).toBe("0");
    expect(sprite.getAttribute("data-expanded-scene")).toBe("false");
    expect(sprite.style.width).toBe("64px");
    expect(sprite.style.height).toBe("64px");
    act(() => vi.advanceTimersByTime(239));
    expect(sprite.getAttribute("data-frame-index")).toBe("0");
    act(() => vi.advanceTimersByTime(1));
    expect(sprite.getAttribute("data-frame-index")).toBe("1");
  });

  it("plays drink once and calls onComplete after the final frame duration", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { getByRole } = render(
      <OfficialSlimeSprite slimeColor="blue" action="drink" onComplete={onComplete} />,
    );
    const sprite = getByRole("img");
    const durations = [220, 160, 180, 140, 140, 160, 180, 280];

    for (const [index, duration] of durations.entries()) {
      expect(sprite.getAttribute("data-frame-index")).toBe(String(index));
      act(() => vi.advanceTimersByTime(duration));
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sprite.getAttribute("data-frame-index")).toBe("7");
  });

  it("repeats a drink action when rendered as a passive preview", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="blue"
        action="drink"
        repeat
        onComplete={onComplete}
      />,
    );
    const sprite = getByRole("img");
    const durations = [220, 160, 180, 140, 140, 160, 180, 280];

    for (const duration of durations) {
      act(() => vi.advanceTimersByTime(duration));
    }

    expect(sprite.getAttribute("data-frame-index")).toBe("0");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("clips a purple strawberry drink to exactly one logical frame", () => {
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="purple"
        action="drink"
        drinkFlavor="strawberry-soda"
        wearables={{ drink: "strawberry-soda" }}
        propAction={{
          kind: "drink",
          itemKey: "slime-purple-drink-strawberry-soda",
          flavor: "strawberry-soda",
        }}
        repeat
      />,
    );

    const sprite = getByRole("img");
    const prop = container.querySelector<HTMLElement>('[data-slime-prop-overlay="true"]');
    const propSheet = prop?.querySelector("img");
    expect(sprite.getAttribute("data-prop-kind")).toBe("drink");
    expect(sprite.getAttribute("data-expanded-scene")).toBe("true");
    expect(sprite.style.width).toBe("96px");
    expect(prop).toBeTruthy();
    expect(prop?.className).toContain(styles.frameViewport);
    expect(prop?.style.overflow || getComputedStyleLikeOverflow(prop)).toBeDefined();
    expect(Number.parseInt(prop?.style.width ?? "0", 10)).toBe(64);
    expect(Number.parseInt(prop?.style.height ?? "0", 10)).toBe(64);
    expect(propSheet?.style.width).not.toBe(prop?.style.width);
    expect(Number.parseInt(propSheet?.style.width ?? "0", 10)).toBeGreaterThan(64);
    // Packed sheet is translated inside the clipped viewport; no document-expanding absolute spill.
    expect(propSheet?.style.transform).toMatch(/translate\(/);
  });

  it("composites red duck tube + baseball + glasses without replacing the base character", () => {
    const vehiclePath = "/creatures/slimes/shop/vehicles/duck-tube/idle-sheet.png";
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="red"
        action="idle"
        backgroundSpritePath="/creatures/slimes/shop/backgrounds/tropical.gif"
        vehicleSpritePath={vehiclePath}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleRiseY={14}
        vehicleBobY={[0, -1, -1, -2, -2, -1, -1, 0]}
        vehicleOffsetX={0}
        wearables={{ eyewear: "round-glasses" }}
        propAction={{
          kind: "ball",
          itemKey: "slime-ball-baseball",
          slug: "baseball",
        }}
        repeat
        scale={2}
      />,
    );

    const sprite = getByRole("img");
    const ballAction = container.querySelector('[data-slime-ball-action-layer="true"]');
    const ballProp = container.querySelector('[data-slime-ball-prop-layer="true"]');
    const vehicle = container.querySelector<HTMLImageElement>(`img[src="${vehiclePath}"]`);
    const glasses = container.querySelector('[data-wearable-role="eyewear"]');
    const character = container.querySelector('[data-slime-character-layer="true"]');
    const legacyGif = container.querySelector(
      'img[src*="slime-red-baseball-hit.gif"]',
    );

    expect(sprite.getAttribute("data-prop-kind")).toBe("ball");
    expect(sprite.getAttribute("data-item-sprite-path")).toBeNull();
    expect(sprite.getAttribute("data-renderer-scale")).toBe("2");
    expect(sprite.style.width).toBe("192px");
    expect(ballAction).toBeTruthy();
    expect(ballProp).toBeTruthy();
    expect(vehicle).toBeTruthy();
    expect(glasses).toBeTruthy();
    // Ball action replaces only the character sheet pixels; vehicle and wearables remain.
    expect(character).toBeNull();
    expect(legacyGif).toBeNull();
    expect(ballAction?.querySelector("img")?.getAttribute("src")).toContain(
      "/baseball/red/action-sheet.png",
    );
    expect(ballProp?.querySelector("img")?.getAttribute("src")).toContain(
      "/baseball/red/prop-sheet.png",
    );
    expect(Number(vehicle?.parentElement?.style.zIndex)).toBe(200);
    expect(Number(ballProp?.className.includes(styles.propLayer))).toBeTruthy();
  });

  it("keeps a new headband during happy and renders the heart above it", () => {
    const vehiclePath = "/creatures/slimes/shop/vehicles/hot-air-balloon/idle-sheet.png";
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="green"
        action="happy"
        wearables={{ headwear: "pearl-ribbon-headband" }}
        vehicleSpritePath={vehiclePath}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleOffsetX={2}
      />,
    );
    const sprite = getByRole("img");
    const headwear = container.querySelector<HTMLElement>('[data-wearable-role="headwear"]');
    const heart = container.querySelector<HTMLImageElement>('[data-happy-heart-layer="top"]');
    const vehicle = container.querySelector<HTMLImageElement>(`img[src="${vehiclePath}"]`);
    const images = Array.from(container.querySelectorAll("img"));

    expect(sprite.getAttribute("data-wearable-keys")).toContain("pearl-ribbon-headband");
    expect(headwear).toBeTruthy();
    expect(heart?.getAttribute("src")).toBe(
      "/creatures/slimes/official/overlays/happy-heart/base/green/sheet.png",
    );
    expect(images.indexOf(vehicle!)).toBeGreaterThan(
      images.indexOf(headwear!.querySelector("img")!),
    );
    expect(images.indexOf(heart!)).toBeGreaterThan(images.indexOf(vehicle!));
    expect(Number(heart?.parentElement?.style.zIndex)).toBeGreaterThan(
      Number(vehicle?.parentElement?.style.zIndex),
    );
  });

  it("loops floor interactions and composites the shared puddle sheet", () => {
    vi.useFakeTimers();
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="blue"
        action="floor-interaction"
        equippedFloor="water-puddle"
      />,
    );
    const sprite = getByRole("img");
    expect(
      container.querySelector('img[src="/creatures/slimes/official/shared/water-puddle/sheet.png"]'),
    ).toBeTruthy();

    for (let index = 0; index < 26; index += 1) {
      act(() => vi.advanceTimersByTime(100));
    }
    expect(sprite.getAttribute("data-frame-index")).toBe("0");
  });

  it("keeps grass and imported static floors visible with a complete item sprite", () => {
    const { container, rerender } = render(
      <OfficialSlimeSprite
        slimeColor="red"
        equippedFloor="grass-floor"
        itemSpritePath="/creatures/slimes/items/red-ball.gif"
      />,
    );

    const sprite = container.firstElementChild as HTMLElement;
    const item = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/items/red-ball.gif"]',
    );
    const grass = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/official/shared/grass-floor.png"]',
    );
    expect(item).toBeTruthy();
    expect(grass).toBeTruthy();
    expect(sprite.style.width).toBe("96px");
    expect(item?.style.width).toBe("64px");
    expect(item?.style.left).toBe("16px");
    expect(grass?.style.width).toBe("72px");
    expect(grass?.style.left).toBe("12px");

    rerender(
      <OfficialSlimeSprite
        slimeColor="red"
        equippedFloor="stone-floor"
        itemSpritePath="/creatures/slimes/items/red-ball.gif"
      />,
    );
    expect(
      container.querySelector('img[src="/creatures/slimes/official/shared/floors/stone-floor.png"]'),
    ).toBeTruthy();
  });

  it("keeps water and trampoline floor layers visible with a complete prop sprite", () => {
    const { container, rerender } = render(
      <OfficialSlimeSprite
        slimeColor="red"
        action="floor-interaction"
        equippedFloor="water-puddle"
        itemSpritePath="/creatures/slimes/items/red-ball.gif"
      />,
    );

    expect(
      container.querySelector('img[src="/creatures/slimes/official/shared/water-puddle/sheet.png"]'),
    ).toBeTruthy();

    rerender(
      <OfficialSlimeSprite
        slimeColor="red"
        action="floor-interaction"
        equippedFloor="trampoline"
        itemSpritePath="/creatures/slimes/items/red-ball.gif"
      />,
    );
    const trampoline = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/official/shared/trampoline-floor.png"]',
    );
    expect(trampoline).toBeTruthy();
    expect(trampoline?.style.width).toBe("72px");
  });

  it("renders synchronized vehicle effect sheets above the vehicle body", () => {
    const bodyPath = "/creatures/slimes/shop/vehicles/go-kart/idle-sheet.png";
    const windPath = "/creatures/slimes/shop/vehicles/go-kart/fx/wind-idle-sheet.png";
    const exhaustPath = "/creatures/slimes/shop/vehicles/go-kart/fx/exhaust-idle-sheet.png";
    const { container, rerender } = render(
      <OfficialSlimeSprite
        slimeColor="blue"
        vehicleSpritePath={bodyPath}
        vehicleEffectSpritePaths={[windPath, exhaustPath]}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleOffsetX={2}
      />,
    );

    const images = Array.from(container.querySelectorAll("img"));
    const body = container.querySelector<HTMLImageElement>(`img[src="${bodyPath}"]`);
    const wind = container.querySelector<HTMLImageElement>(`img[src="${windPath}"]`);
    const exhaust = container.querySelector<HTMLImageElement>(`img[src="${exhaustPath}"]`);
    const rider = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/official/base/blue/idle/sheet.png"]',
    );

    expect(body).toBeTruthy();
    expect(wind).toBeTruthy();
    expect(exhaust).toBeTruthy();
    expect(images.indexOf(wind!)).toBeGreaterThan(images.indexOf(body!));
    expect(images.indexOf(exhaust!)).toBeGreaterThan(images.indexOf(wind!));
    expect(wind?.style.width).toBe(body?.style.width);
    expect(wind?.style.transform).toBe(body?.style.transform);
    expect(body?.parentElement?.style.top).toBe("-1px");
    expect(body?.parentElement?.style.left).toBe("18px");
    expect(wind?.parentElement?.style.left).toBe("18px");
    expect(exhaust?.parentElement?.style.left).toBe("18px");
    expect(rider?.parentElement?.style.left).toBe("16px");

    rerender(
      <OfficialSlimeSprite
        slimeColor="blue"
        equippedFloor="stone-floor"
        vehicleSpritePath={bodyPath}
        vehicleEffectSpritePaths={[windPath, exhaustPath]}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleOffsetX={2}
      />,
    );
    const bodyWithFloor = container.querySelector<HTMLImageElement>(`img[src="${bodyPath}"]`);
    expect(bodyWithFloor?.parentElement?.style.top).toBe("-1px");
  });

  it("feathers only the scene background with the shared product mask", () => {
    const { container, rerender } = render(
      <OfficialSlimeSprite
        slimeColor="red"
        equippedFloor="grass-floor"
        itemSpritePath="https://cdn.example.test/slime-prop.gif"
        backgroundSpritePath="https://cdn.example.test/shooting-star-night-sky.gif"
      />,
    );

    const background = container.querySelector<HTMLImageElement>(
      'img[src="https://cdn.example.test/shooting-star-night-sky.gif"]',
    );
    const floor = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/official/shared/grass-floor.png"]',
    );
    const prop = container.querySelector<HTMLImageElement>(
      'img[src="https://cdn.example.test/slime-prop.gif"]',
    );
    const feather = background?.parentElement;
    const sprite = container.firstElementChild as HTMLElement;
    expect(background).toBeTruthy();
    expect(floor).toBeTruthy();
    expect(prop).toBeTruthy();
    expect(feather?.className).toContain(styles.backgroundFeather);
    expect(feather?.getAttribute("data-background-feather")).toBe("mask-product");
    expect(styles.backgroundFeather).toBeTruthy();
    expect(feather?.style.width).toBe("96px");
    expect(feather?.style.height).toBe("96px");
    expect(sprite.getAttribute("data-expanded-scene")).toBe("true");
    expect(sprite.style.width).toBe("96px");
    expect(background?.className).toContain(styles.background);
    expect(background?.getAttribute("alt")).toBe("");
    expect(background?.getAttribute("aria-hidden")).toBe("true");
    expect(
      Array.from(container.querySelectorAll("img")).indexOf(background!),
    ).toBeLessThan(Array.from(container.querySelectorAll("img")).indexOf(floor!));
    expect(
      Array.from(container.querySelectorAll("img")).indexOf(floor!),
    ).toBeLessThan(Array.from(container.querySelectorAll("img")).indexOf(prop!));
    expect(container.firstElementChild?.getAttribute("data-background-sprite-path")).toBe(
      "https://cdn.example.test/shooting-star-night-sky.gif",
    );

    // Module CSS uses the shared single-pass mask asset, not dual linear gradients.
    expect(styles.backgroundFeather).toBeTruthy();

    rerender(
      <OfficialSlimeSprite
        slimeColor="red"
        backgroundSpritePath="/creatures/slimes/shop/backgrounds/cherry-cloud-ume/aura-package/cherry-cloud-ume-6s-128.gif"
      />,
    );
    const logical128Background = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/shop/backgrounds/cherry-cloud-ume/aura-package/cherry-cloud-ume-6s-128.gif"]',
    );
    expect(logical128Background?.parentElement?.className).toContain(styles.backgroundFeather);
    expect(logical128Background?.parentElement?.style.width).toBe("96px");
    expect(logical128Background?.parentElement?.style.height).toBe("96px");

    rerender(
      <OfficialSlimeSprite
        slimeColor="red"
        scale={4}
        backgroundSpritePath="creatures/slimes/shop/shooting-star-night-sky.gif"
      />,
    );
    const scaledBackground = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/shop/shooting-star-night-sky.gif"]',
    );
    expect(scaledBackground).toBeTruthy();
    expect(scaledBackground?.parentElement?.className).toContain(styles.backgroundFeather);
    expect(scaledBackground?.parentElement?.style.width).toBe("384px");
    expect(scaledBackground?.parentElement?.style.height).toBe("384px");
  });

  it("lands vehicle and rider offsets on the shared logical geometry contract", () => {
    const bodyPath = "/creatures/slimes/shop/vehicles/duck-tube/idle-sheet.png";
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="red"
        vehicleSpritePath={bodyPath}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleRiseY={14}
        vehicleBobY={[0, -1, -1, -2, -2, -1, -1, 0]}
        vehicleOffsetX={0}
        scale={2}
      />,
    );

    const sprite = getByRole("img");
    const body = container.querySelector<HTMLImageElement>(`img[src="${bodyPath}"]`);
    const rider = container.querySelector<HTMLImageElement>(
      'img[src="/creatures/slimes/official/base/red/idle/sheet.png"]',
    );

    expect(sprite.getAttribute("data-expanded-scene")).toBe("true");
    expect(sprite.getAttribute("data-renderer-scale")).toBe("2");
    expect(sprite.style.width).toBe("192px");
    expect(sprite.getAttribute("data-vehicle-rise")).toBe("28");
    expect(sprite.getAttribute("data-vehicle-top")).toBe("-34");
    expect(sprite.getAttribute("data-vehicle-left")).toBe("0");
    expect(sprite.getAttribute("data-rider-offset-y")).toBe("-28");
    expect(body?.parentElement?.style.width).toBe("128px");
    expect(body?.parentElement?.style.height).toBe("162px");
    expect(body?.parentElement?.style.top).toBe("-2px");
    expect(body?.parentElement?.style.left).toBe("32px");
    expect(rider?.parentElement?.style.left).toBe("32px");
    expect(rider?.parentElement?.style.top).toBe("32px");
    expect(rider?.style.transform).toContain("translate(");
  });

  it("keeps prop drink overlays above vehicle layers", () => {
    const vehiclePath = "/creatures/slimes/shop/vehicles/duck-tube/idle-sheet.png";
    const { container } = render(
      <OfficialSlimeSprite
        slimeColor="purple"
        action="drink"
        drinkFlavor="strawberry-soda"
        wearables={{ drink: "strawberry-soda" }}
        propAction={{
          kind: "drink",
          itemKey: "slime-purple-drink-strawberry-soda",
          flavor: "strawberry-soda",
        }}
        vehicleSpritePath={vehiclePath}
        vehicleFrameCount={8}
        vehicleCanvasHeight={81}
        vehicleCharacterOffsetY={17}
        vehicleRiseY={14}
        scale={2}
        repeat
      />,
    );
    const vehicle = container.querySelector<HTMLElement>(
      '[data-slime-vehicle-layer="true"]',
    );
    const drink = container.querySelector<HTMLElement>(
      '[data-slime-prop-overlay="true"]',
    );
    expect(vehicle).toBeTruthy();
    expect(drink).toBeTruthy();
    expect(Number(drink?.style.zIndex)).toBeGreaterThan(Number(vehicle?.style.zIndex));
    expect(Number(drink?.style.zIndex)).toBe(501);
  });

  it("never applies non-integer CSS scale transforms on composed layers", () => {
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="purple"
        action="drink"
        drinkFlavor="strawberry-soda"
        wearables={{ drink: "strawberry-soda" }}
        propAction={{
          kind: "drink",
          itemKey: "slime-purple-drink-strawberry-soda",
          flavor: "strawberry-soda",
        }}
        backgroundSpritePath="/creatures/slimes/shop/backgrounds/tropical.gif"
        scale={2}
        repeat
      />,
    );
    const sprite = getByRole("img");
    expect(sprite.getAttribute("data-renderer-scale")).toBe("2");
    expect(sprite.style.width).toBe("192px");
    for (const node of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      const transform = node.style.transform || "";
      expect(transform).not.toMatch(/scale\(/i);
      if (node.style.width) {
        const width = Number.parseFloat(node.style.width);
        if (Number.isFinite(width)) expect(Number.isInteger(width)).toBe(true);
      }
    }
  });
});

function getComputedStyleLikeOverflow(node: HTMLElement | null): string {
  return node?.style.overflow || "hidden";
}
