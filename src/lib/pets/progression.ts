import type { PetLineageDefinition, PetProduct } from "./catalog";

export type PetProgressState = {
  stage: number;
  hatchProgress: number;
  hatchRequired: number;
  experience: number;
};

export type PetProgressResult = PetProgressState & {
  hatched: boolean;
  evolved: boolean;
};

const bounded = (value: number, minimum = 0, maximum = 1_000_000): number =>
  Math.min(maximum, Math.max(minimum, Math.trunc(value)));

export function nextEvolutionThreshold(
  lineage: PetLineageDefinition,
  currentStage: number,
): number | null {
  if (currentStage < 1 || currentStage >= 3) return null;
  return lineage.stages[currentStage]?.evolveAtXp ?? null;
}

export function canEvolvePet(
  lineage: PetLineageDefinition,
  state: PetProgressState,
): boolean {
  const threshold = nextEvolutionThreshold(lineage, state.stage);
  return threshold !== null && state.experience >= threshold;
}

export function applyHatchPoints(
  state: PetProgressState,
  points: number,
): PetProgressResult {
  if (state.stage !== 0) return { ...state, hatched: false, evolved: false };
  const hatchRequired = Math.max(1, bounded(state.hatchRequired, 1));
  const hatchProgress = Math.min(hatchRequired, bounded(state.hatchProgress + points));
  const hatched = hatchProgress >= hatchRequired;
  return {
    ...state,
    stage: hatched ? 1 : 0,
    hatchProgress,
    hatchRequired,
    hatched,
    evolved: false,
  };
}

export function applyPetFood(
  state: PetProgressState,
  product: Pick<PetProduct, "hatchPoints" | "experience">,
): PetProgressResult {
  if (state.stage === 0) return applyHatchPoints(state, product.hatchPoints ?? 0);
  return {
    ...state,
    experience: bounded(state.experience + (product.experience ?? 0)),
    hatched: false,
    evolved: false,
  };
}

export function evolvePet(
  lineage: PetLineageDefinition,
  state: PetProgressState,
): PetProgressResult | null {
  if (!canEvolvePet(lineage, state)) return null;
  return {
    ...state,
    stage: Math.min(3, state.stage + 1),
    hatched: false,
    evolved: true,
  };
}

export function progressPercent(current: number, required: number): number {
  if (required <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, current / required)) * 100);
}
