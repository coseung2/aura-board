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

  it("keeps a new headband during happy and renders the heart above it", () => {
    const { container, getByRole } = render(
      <OfficialSlimeSprite
        slimeColor="green"
        action="happy"
        wearables={{ headwear: "pearl-ribbon-headband" }}
      />,
    );
    const sprite = getByRole("img");
    const headwear = container.querySelector<HTMLImageElement>('[data-wearable-role="headwear"]');
    const heart = container.querySelector<HTMLImageElement>('[data-happy-heart-layer="top"]');
    const images = Array.from(container.querySelectorAll("img"));

    expect(sprite.getAttribute("data-wearable-keys")).toContain("pearl-ribbon-headband");
    expect(headwear).toBeTruthy();
    expect(heart?.getAttribute("src")).toBe(
      "/creatures/slimes/official/overlays/happy-heart/base/green/sheet.png",
    );
    expect(images.indexOf(heart!)).toBeGreaterThan(images.indexOf(headwear!));
    expect(Number(heart?.style.zIndex)).toBeGreaterThan(Number(headwear?.style.zIndex));
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

    expect(
      container.querySelector('img[src="/creatures/slimes/items/red-ball.gif"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('img[src="/creatures/slimes/official/shared/grass-floor.png"]'),
    ).toBeTruthy();

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
    expect(
      container.querySelector('img[src="/creatures/slimes/official/shared/trampoline-floor.png"]'),
    ).toBeTruthy();
  });

  it("feathers only the scene background while preserving layer order and accessibility", () => {
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
    expect(background).toBeTruthy();
    expect(floor).toBeTruthy();
    expect(prop).toBeTruthy();
    expect(feather?.className).toContain(styles.backgroundFeather);
    expect(feather?.getAttribute("data-background-feather")).toBe("responsive-edge");
    expect(feather?.style.width).toBe("64px");
    expect(feather?.style.height).toBe("64px");
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
    expect(logical128Background?.parentElement?.style.width).toBe("64px");
    expect(logical128Background?.parentElement?.style.height).toBe("64px");

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
    expect(scaledBackground?.parentElement?.style.width).toBe("256px");
    expect(scaledBackground?.parentElement?.style.height).toBe("256px");
  });
});
