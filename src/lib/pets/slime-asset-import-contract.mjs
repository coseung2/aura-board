export const SLIME_COLORS = ["blue", "green", "yellow", "purple", "red"];
export const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"];

/** Drink flavors that ship their own distinct character timeline. */
export const SLIME_DRINK_FLAVORS = [
  "lemonade",
  "strawberry-soda",
  "melon-soda",
  "grape-soda",
  "blue-ramune",
];

export const SLIME_DRINK_ACTIONS = SLIME_DRINK_FLAVORS.map((flavor) => `drink-${flavor}`);

export const SLIME_ACTIONS = [
  "idle",
  "happy",
  ...SLIME_DRINK_ACTIONS,
  "water-puddle",
  "trampoline",
];

export const SLIME_PLAYBACK_BY_ACTION = {
  idle: { loop: true, oneShot: false },
  happy: { loop: false, oneShot: true },
  ...Object.fromEntries(
    SLIME_DRINK_ACTIONS.map((action) => [action, { loop: false, oneShot: true }]),
  ),
  "water-puddle": { loop: false, oneShot: true },
  trampoline: { loop: false, oneShot: true },
};

export function slimeExpectedActionsForEvolution(evolution) {
  if (evolution === "base") return SLIME_ACTIONS;
  return SLIME_ACTIONS.filter(
    (action) =>
      action !== "idle" &&
      action !== "happy" &&
      (!action.startsWith("drink-") || action === "drink-lemonade"),
  );
}
