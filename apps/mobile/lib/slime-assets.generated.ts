// Generated mobile-local split for slime-assets.generated.ts.
// Source value SHA-256: 1d56f9325079e9814fdd725eea9063383d3a931cc89f8afc1cf7019b17931333
// Stable exports: SLIME_MOBILE_ASSET_REGISTRY,SLIME_MOBILE_CROWN_OVERLAY_REGISTRY,SLIME_MOBILE_HAPPY_HEART_OVERLAY_REGISTRY,SLIME_MOBILE_SHARED_ASSETS,SLIME_MOBILE_ANIMATION_MANIFEST
// Regenerate the monolith first, then run scripts/split-generated-slime-registries.mjs.

import { SLIME_GENERATED_CHUNK_060 } from "./slime-assets.generated.value.chunk-060";
import { SLIME_GENERATED_CHUNK_064 } from "./slime-assets.generated.value.chunk-064";
import { SLIME_GENERATED_CHUNK_065 } from "./slime-assets.generated.value.chunk-065";

export const SLIME_MOBILE_ASSET_REGISTRY = SLIME_GENERATED_CHUNK_060;
export const SLIME_MOBILE_CROWN_OVERLAY_REGISTRY = {
  "gold-crown-red-gem/blue": {
    key: "gold-crown-red-gem/blue",
    imageScale: 4,
    differingPixels: 298,
    overlay: require("../assets/slimes/overlays/gold-crown-red-gem/blue/overlay.png"),
  },
  "gold-crown-red-gem/green": {
    key: "gold-crown-red-gem/green",
    imageScale: 4,
    differingPixels: 424,
    overlay: require("../assets/slimes/overlays/gold-crown-red-gem/green/overlay.png"),
  },
  "gold-crown-red-gem/purple": {
    key: "gold-crown-red-gem/purple",
    imageScale: 4,
    differingPixels: 298,
    overlay: require("../assets/slimes/overlays/gold-crown-red-gem/purple/overlay.png"),
  },
  "gold-crown-red-gem/red": {
    key: "gold-crown-red-gem/red",
    imageScale: 4,
    differingPixels: 298,
    overlay: require("../assets/slimes/overlays/gold-crown-red-gem/red/overlay.png"),
  },
  "gold-crown-red-gem/yellow": {
    key: "gold-crown-red-gem/yellow",
    imageScale: 4,
    differingPixels: 298,
    overlay: require("../assets/slimes/overlays/gold-crown-red-gem/yellow/overlay.png"),
  },
  "silver-crown-blue-gem/blue": {
    key: "silver-crown-blue-gem/blue",
    imageScale: 4,
    differingPixels: 312,
    overlay: require("../assets/slimes/overlays/silver-crown-blue-gem/blue/overlay.png"),
  },
  "silver-crown-blue-gem/green": {
    key: "silver-crown-blue-gem/green",
    imageScale: 4,
    differingPixels: 435,
    overlay: require("../assets/slimes/overlays/silver-crown-blue-gem/green/overlay.png"),
  },
  "silver-crown-blue-gem/purple": {
    key: "silver-crown-blue-gem/purple",
    imageScale: 4,
    differingPixels: 531,
    overlay: require("../assets/slimes/overlays/silver-crown-blue-gem/purple/overlay.png"),
  },
  "silver-crown-blue-gem/red": {
    key: "silver-crown-blue-gem/red",
    imageScale: 4,
    differingPixels: 312,
    overlay: require("../assets/slimes/overlays/silver-crown-blue-gem/red/overlay.png"),
  },
  "silver-crown-blue-gem/yellow": {
    key: "silver-crown-blue-gem/yellow",
    imageScale: 4,
    differingPixels: 312,
    overlay: require("../assets/slimes/overlays/silver-crown-blue-gem/yellow/overlay.png"),
  },
} as const;
export const SLIME_MOBILE_HAPPY_HEART_OVERLAY_REGISTRY =
  SLIME_GENERATED_CHUNK_064;
export const SLIME_MOBILE_SHARED_ASSETS = SLIME_GENERATED_CHUNK_065;
export const SLIME_MOBILE_ANIMATION_MANIFEST = {
  schemaVersion: 1,
  imageScale: 4,
  colors: ["blue", "green", "yellow", "purple", "red"],
  evolutions: ["base", "gold-crown-red-gem", "silver-crown-blue-gem"],
  actions: [
    "idle",
    "happy",
    "drink-lemonade",
    "drink-strawberry-soda",
    "drink-melon-soda",
    "drink-grape-soda",
    "drink-blue-ramune",
    "water-puddle",
    "trampoline",
  ],
  playbackByAction: {
    idle: {
      loop: true,
      oneShot: false,
    },
    happy: {
      loop: false,
      oneShot: true,
    },
    "drink-lemonade": {
      loop: false,
      oneShot: true,
    },
    "drink-strawberry-soda": {
      loop: false,
      oneShot: true,
    },
    "drink-melon-soda": {
      loop: false,
      oneShot: true,
    },
    "drink-grape-soda": {
      loop: false,
      oneShot: true,
    },
    "drink-blue-ramune": {
      loop: false,
      oneShot: true,
    },
    "water-puddle": {
      loop: false,
      oneShot: true,
    },
    trampoline: {
      loop: false,
      oneShot: true,
    },
  },
  assets: SLIME_MOBILE_ASSET_REGISTRY,
  crownOverlays: SLIME_MOBILE_CROWN_OVERLAY_REGISTRY,
  happyHeartOverlays: SLIME_MOBILE_HAPPY_HEART_OVERLAY_REGISTRY,
  shared: SLIME_MOBILE_SHARED_ASSETS,
} as const;
