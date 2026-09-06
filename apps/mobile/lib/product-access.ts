/** Wire contract only. The server owns the rollout rules and allowed layouts. */
export type ProductAccess = {
  productCapabilities?: Partial<Record<"play" | "feed" | "community" | "liveQuiz" | "agent" | "developmentLayouts", boolean>>;
  availableLayouts?: string[];
};

export function hasProductAccess(access: ProductAccess | null | undefined, feature: "play" | "feed"): boolean {
  return access?.productCapabilities?.[feature] === true;
}

export function canReadMobileLayout(access: ProductAccess | null | undefined, layout: string): boolean {
  return Array.isArray(access?.availableLayouts) && access.availableLayouts.includes(layout);
}

export function visibleProductTargets<T extends { id: string }>(targets: T[], access: ProductAccess | null | undefined): T[] {
  return targets.filter((target) => target.id !== "feed" || hasProductAccess(access, "feed"));
}

export function restrictedStudentPath(pathname: string, access: ProductAccess | null | undefined): boolean {
  return (pathname === "/feed" || pathname.startsWith("/feed/")) && !hasProductAccess(access, "feed");
}
