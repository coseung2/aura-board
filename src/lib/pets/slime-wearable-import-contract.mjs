export const SLIME_COLORS = ["blue", "green", "purple", "red", "yellow"];
export const WEARABLE_ROLES = ["blush", "eyewear", "headwear", "drink"];
export const IDLE_DERIVED_ROLES = new Set(["blush", "eyewear", "headwear"]);
export const UNPUBLISHED_ROLES = new Set();
export const CANVAS = { width: 64, height: 64 };

const TIMELINES = {
  idle: { frameCount: 8, canvasHeight: 64, derivesFrom: null, grounded: true },
  happy: { frameCount: 12, canvasHeight: 64, derivesFrom: null, grounded: true },
  "ball-hit": { frameCount: 18, canvasHeight: 64, derivesFrom: null, grounded: true },
  "water-puddle": { frameCount: 26, canvasHeight: 81, derivesFrom: null, grounded: false, characterOffsetY: 17 },
  trampoline: { frameCount: 26, canvasHeight: 81, derivesFrom: null, grounded: false, characterOffsetY: 17 },
};

const DRINK_FRAME_COUNT = 8;
export const IDLE_FRAME_COUNT = TIMELINES.idle.frameCount;
export const FRAME_COUNT = IDLE_FRAME_COUNT;

export function timelineSpec(timeline) {
  if (timeline.startsWith("drink-") || timeline.startsWith("drink:")) {
    return {
      frameCount: DRINK_FRAME_COUNT,
      canvasHeight: CANVAS.height,
      derivesFrom: "idle",
      grounded: true,
    };
  }
  const spec = TIMELINES[timeline];
  if (!spec) throw new Error(`Unknown wearable timeline: ${timeline}`);
  return spec;
}

export function frameCountFor(timeline) {
  return timelineSpec(timeline).frameCount;
}

export function canvasHeightFor(timeline) {
  return timelineSpec(timeline).canvasHeight;
}

export function characterOffsetYFor(timeline) {
  return timelineSpec(timeline).characterOffsetY ?? 0;
}
