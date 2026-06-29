import type { AuraBoardSettings } from "../AuraEvaluationControl";

export type BoardSection = {
  id: string;
  title: string;
  accessToken: string | null;
};

export type BoardTheme =
  | "pastel-peach"
  | "pastel-mint"
  | "pastel-sky"
  | "pastel-lilac"
  | "pastel-lemon";

export type BoardSettingsTab = "basic" | "breakout" | "canva" | "aura";

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
};
