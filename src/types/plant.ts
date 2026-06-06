/**
 * Shared client+server types for plant-journal UI.
 */
export type Difficulty = "easy" | "medium" | "hard";
export type Season = "spring" | "summer" | "fall" | "winter" | "all";

export interface StageDTO {
  id: string;
  order: number;
  key: string;
  nameKo: string;
  description: string;
  icon: string;
  observationPoints: string[];
}

export interface SpeciesDTO {
  id: string;
  key: string;
  nameKo: string;
  emoji: string;
  difficulty: Difficulty | string;
  season: Season | string;
  notes: string;
  stages: StageDTO[];
}

export interface ObservationImageDTO {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  order: number;
}

export interface ObservationDTO {
  id: string;
  stageId: string;
  memo: string;
  noPhotoReason: string | null;
  observedAt: string;
  images: ObservationImageDTO[];
}

export interface StudentPlantDTO {
  id: string;
  speciesId: string;
  nickname: string;
  currentStageId: string;
  species: SpeciesDTO;
  observations: ObservationDTO[];
}

export interface TeacherSummaryStudentRow {
  id: string;
  number: number | null;
  name: string;
  nickname: string | null;
  speciesName: string | null;
  speciesEmoji: string | null;
  currentStageOrder: number | null;
  currentStageName: string | null;
  lastObservedAt: string | null;
  stalled: boolean;
}

export interface TeacherSummaryDTO {
  classroomId: string;
  totalStudents: number;
  plantedCount: number;
  distribution: Record<string, number>;
  students: TeacherSummaryStudentRow[];
}

export interface RecentObservationDTO {
  id: string;
  stageId: string;
  memo: string | null;
  observedAt: string;
  thumbnail: string | null;
  imageUrl: string | null;
  student: { id: string; name: string; number: number | null };
  species: { emoji: string; nameKo: string };
  plantNickname: string;
}

export interface PlantJournalResponse {
  board: { id: string; title: string; classroomId: string | null };
  role: "owner" | "editor" | "viewer" | null;
  viewer: { kind: string; studentId: string | null };
  species: SpeciesDTO[];
  myPlant: StudentPlantDTO | null;
  teacherSummary: TeacherSummaryDTO | null;
  recentObservations: RecentObservationDTO[] | null;
}
