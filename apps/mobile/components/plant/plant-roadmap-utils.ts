import type {
  BoardDetailResponse,
  ObservationDTO,
  StageDTO,
  StudentPlantDTO,
} from "../../lib/types";

/** API payload shape used by the board-detail endpoint before normalisation. */
export type PlantRoadmapRawPlant =
  NonNullable<
    BoardDetailResponse["layoutData"]["plantRoadmap"]
  >["plants"][number];

export const STALL_THRESHOLD_DAYS = 7;

/** Keep stage observations in their server order while making lookup cheap. */
export function groupObservationsByStage(
  observations: ObservationDTO[],
): Map<string, ObservationDTO[]> {
  const grouped = new Map<string, ObservationDTO[]>();
  for (const observation of observations) {
    const stageObservations = grouped.get(observation.stageId) ?? [];
    stageObservations.push(observation);
    grouped.set(observation.stageId, stageObservations);
  }
  return grouped;
}

/** Return a stable, non-negative age for the most recent valid observation. */
export function computeDaysSinceLastObs(
  observations: ObservationDTO[],
): number | null {
  const timestamps = observations
    .map((observation) => Date.parse(observation.observedAt))
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) return null;

  const latest = Math.max(...timestamps);
  return Math.max(0, Math.floor((Date.now() - latest) / (24 * 60 * 60 * 1000)));
}

/** The API historically returned observation points as either JSON or arrays. */
export function normalizeObservationPoints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((point): point is string => typeof point === "string")
      .map((point) => point.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    return normalizeObservationPoints(JSON.parse(value));
  } catch {
    return [];
  }
}

/**
 * Board detail and student-plant endpoints have slightly different optional
 * fields. Normalising at the boundary keeps every child component simple and
 * prevents a missing image/stage point from crashing the journal.
 */
export function normalizePlant(
  raw: PlantRoadmapRawPlant | StudentPlantDTO | null | undefined,
): StudentPlantDTO | null {
  if (!raw?.species) return null;
  const rawWithStage = raw as Partial<{ currentStage?: StageDTO }>;

  return {
    id: raw.id,
    speciesId: raw.speciesId ?? raw.species.id,
    nickname: raw.nickname,
    currentStageId: raw.currentStageId ?? rawWithStage.currentStage?.id ?? "",
    species: {
      ...raw.species,
      stages: (raw.species.stages ?? []).map((stage) => ({
        ...stage,
        observationPoints: normalizeObservationPoints(
          (stage as { observationPoints?: unknown }).observationPoints,
        ),
      })),
    },
    observations: (raw.observations ?? []).map((observation) => ({
      ...observation,
      images: observation.images ?? [],
    })),
  };
}

/** Keep progress semantics aligned with the web roadmap (stage 1 is 25%). */
export function calculateProgressPercent(
  stages: StageDTO[],
  currentStage: StageDTO | null,
): number {
  if (stages.length === 0 || !currentStage) return 0;
  return Math.min(100, Math.max(0, Math.round((currentStage.order / stages.length) * 100)));
}
