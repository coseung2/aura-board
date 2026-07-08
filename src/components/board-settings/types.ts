import type { AuraBoardSettings } from "../AuraEvaluationControl";
import type { SubjectOrder } from "@/lib/subject-order";

export type BoardSection = {
  id: string;
  title: string;
  accessToken: string | null;
  /** 시각적 정렬 순서 (sortSections: pinned asc / unpinned desc). */
  order?: number;
  pinned?: boolean;
  /** 출석번호 시드에 사용된 정렬 방향. 시드 섹션 식별용. */
  fromStudentSeed?: boolean;
};

export type BoardTheme =
  | "pastel-peach"
  | "pastel-mint"
  | "pastel-sky"
  | "pastel-lilac"
  | "pastel-lemon";

export type BoardSettingsTab = "basic" | "topics" | "breakout" | "canva" | "aura";

export type BoardSettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  classrooms?: Array<{
    id: string;
    name: string;
    studentCount: number;
  }>;
  initialClassroomId?: string | null;
  initialThumbnailMode?: string | null;
  initialThumbnailUrl?: string | null;
  boardId: string;
  layout: string;
  initialSections: BoardSection[];
  initialAnonymousAuthor?: boolean;
  initialBoardTheme?: BoardTheme;
  initialShareMode?: string;
  initialShareToken?: string | null;
  initialShareShortCode?: string | null;
  initialStreamTitlePrompt?: string;
  initialStreamContentPrompt?: string;
  initialStreamSectionsEnabled?: boolean;
  initialAuraSettings?: AuraBoardSettings;
  /** 보드의 기본 subjectOrder. 주제 정렬 탭과 학생이름 시드 모달에 사용. */
  initialSubjectOrder?: SubjectOrder | null;
  onAnonymousAuthorChange?: (next: boolean) => void;
  isAdmin?: boolean;
};
