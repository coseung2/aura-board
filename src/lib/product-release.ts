/** Product rollout policy. Pure data/functions: no React, secrets or client env. */
export type ReleaseAudience = { isAdmin?: boolean; isAdminClassroom?: boolean };
export type ReleaseStage = "stable" | "legacy" | "development";
type LayoutRelease = { stage: ReleaseStage; picker: "enabled" | "disabled" | "hidden" };

export const LAYOUT_RELEASES = {
  freeform: { stage: "stable", picker: "enabled" },
  columns: { stage: "stable", picker: "enabled" },
  "dj-queue": { stage: "stable", picker: "enabled" },
  "plant-roadmap": { stage: "stable", picker: "enabled" },
  // Keep existing read paths; these layouts are not offered for new creation.
  grid: { stage: "legacy", picker: "hidden" },
  "event-signup": { stage: "legacy", picker: "hidden" },
  stream: { stage: "development", picker: "enabled" },
  assignment: { stage: "development", picker: "disabled" },
  quiz: { stage: "development", picker: "disabled" },
  breakout: { stage: "development", picker: "hidden" },
  assessment: { stage: "development", picker: "disabled" },
  "vibe-arcade": { stage: "development", picker: "disabled" },
  "vibe-gallery": { stage: "development", picker: "disabled" },
  "question-board": { stage: "development", picker: "disabled" },
  kordle: { stage: "development", picker: "hidden" },
  "speed-game": { stage: "development", picker: "hidden" },
  "shadow-alliance": { stage: "development", picker: "hidden" },
  omok: { stage: "development", picker: "hidden" },
  "song-guess": { stage: "development", picker: "hidden" },
} as const satisfies Record<string, LayoutRelease>;

export type ProductLayout = keyof typeof LAYOUT_RELEASES;
export const PRODUCT_FEATURES = ["play", "feed", "community", "liveQuiz", "agent", "developmentLayouts"] as const;
export type ProductFeature = typeof PRODUCT_FEATURES[number];
export type ProductCapabilities = Record<ProductFeature, boolean>;

export function layoutRelease(layout: string): LayoutRelease | null {
  return Object.prototype.hasOwnProperty.call(LAYOUT_RELEASES, layout)
    ? LAYOUT_RELEASES[layout as ProductLayout] : null;
}

export function canUseProductFeature(feature: ProductFeature, audience: ReleaseAudience = {}): boolean {
  if (!PRODUCT_FEATURES.includes(feature)) return false;
  return audience.isAdmin === true || (feature !== "community" && audience.isAdminClassroom === true);
}

export function productCapabilities(audience: ReleaseAudience = {}): ProductCapabilities {
  return Object.fromEntries(PRODUCT_FEATURES.map((feature) => [feature, canUseProductFeature(feature, audience)])) as ProductCapabilities;
}

export function canReadLayout(layout: string, audience: ReleaseAudience = {}): boolean {
  const release = layoutRelease(layout);
  return Boolean(release && (release.stage !== "development" || canUseProductFeature("developmentLayouts", audience)));
}

export function canCreateLayout(layout: string, audience: ReleaseAudience = {}): boolean {
  const release = layoutRelease(layout);
  return Boolean(release && (release.stage === "stable" || audience.isAdmin === true));
}

export function availableLayoutKeys(audience: ReleaseAudience = {}): ProductLayout[] {
  return (Object.keys(LAYOUT_RELEASES) as ProductLayout[]).filter((layout) => canReadLayout(layout, audience));
}

export function layoutReleaseBadge(layout: string): string | null {
  return layoutRelease(layout)?.stage === "development" ? "개발중" : null;
}
