// Aura-board 서버 응답 DTO 의 모바일 사본. 웹 side 와 shape 1:1.
// 스키마 변경 시 여기도 동기화 필요. (단위 테스트 X — 스모크로 커버.)

export type BoardMeta = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  description?: string | null;
  classroomId?: string | null;
  _count?: { cards: number };
  quizzes?: Array<{ roomCode: string | null; status: string }>;
};

export type MeResponse = {
  student: {
    id: string;
    name: string;
    classroom: { id: string; name: string } | null;
  };
  boards: BoardMeta[];
};

export type CardAttachment = {
  id: string;
  kind: "image" | "video" | "file";
  url: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

export type CardAuthor = {
  id: string;
  displayName: string;
  studentId: string | null;
};

export type BoardCard = {
  id: string;
  boardId: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  order: number | null;
  sectionId: string | null;
  authorId: string | null;
  externalAuthorName: string | null;
  studentAuthorId: string | null;
  // DJ queue 전용 — pending/approved/rejected/played
  queueStatus?: string | null;
  // Submission 경로 — 학생이 POST /api/boards/:id/queue 로 올린 카드
  createdAt: string;
  updatedAt: string;
  attachments?: CardAttachment[];
  authors?: CardAuthor[];
  authorName?: string | null;
  studentAuthorName?: string | null;
};

export type Section = {
  id: string;
  boardId: string;
  title: string;
  order: number;
  color: string | null;
};

// ─── Plant Journal Types (웹 src/types/plant.ts 와 1:1 동기화) ───

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

export interface PlantJournalResponse {
  board: { id: string; title: string; classroomId: string | null };
  role: "owner" | "editor" | "viewer" | null;
  viewer: { kind: string; studentId: string | null };
  species: SpeciesDTO[];
  myPlant: StudentPlantDTO | null;
}

// ─── Board Detail Response ───

export type BoardDetailResponse = {
  board: BoardMeta;
  cards: BoardCard[];
  sections: Section[];
  currentStudent: {
    id: string;
    name: string;
    classroomId: string;
  };
  layoutData: {
    quiz?: {
      room: {
        id: string;
        roomCode: string | null;
        status: string;
        title: string | null;
      } | null;
    };
    assignment?: {
      slots: Array<{
        id: string;
        boardId: string;
        studentId: string;
        slotNumber: number;
        submissionStatus: string;
        gradingStatus: string;
        grade: string | null;
        returnReason: string | null;
        card: {
          id: string;
          title: string;
          content: string;
          imageUrl: string | null;
          linkUrl: string | null;
          fileUrl: string | null;
        };
        student: { id: string; name: string; number: number | null };
        submission: {
          id: string;
          content: string | null;
          imageUrl: string | null;
          fileUrl: string | null;
          linkUrl: string | null;
          submittedAt: string;
        } | null;
      }>;
    };
    vibeArcade?: {
      config: {
        enabled: boolean;
        perStudentDailyTokenCap: number;
        classroomDailyTokenPool: number;
      } | null;
      projects: Array<{
        id: string;
        title: string;
        updatedAt: string;
        thumbnailUrl: string | null;
        moderationStatus: string;
        authorStudentId: string;
      }>;
    };
    plantRoadmap?: {
      plants: Array<{
        id: string;
        nickname: string;
        speciesId: string;
        currentStageId: string;
        species: SpeciesDTO;
        currentStage: StageDTO;
        observations: ObservationDTO[];
      }>;
    };
  };
};
