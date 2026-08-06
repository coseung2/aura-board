export type LiveQuizViewerKind = "teacher" | "student";
export type LiveQuizPhase = "waiting" | "live" | "finished" | "setup";
export type LiveQuizStage = "answer" | "reveal";
export type LiveQuizQuestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "archived";

export type LiveQuizQuestionView = {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
  category: string | null;
};

export type LiveQuizStateResponse = {
  phase: LiveQuizPhase;
  serverNow: string;
  sessionKey: string;
  startsAt: string;
  endsAt: string;
  nextStartsAt: string;
  questionCount: number;
  score: number;
  answeredCount: number;
  questionNumber: number | null;
  stage: LiveQuizStage | null;
  stageEndsAt: string | null;
  question: LiveQuizQuestionView | null;
  selectedChoice: number | null;
  correctChoice: number | null;
  isCorrect: boolean | null;
  explanation: string | null;
  activeAnswerCount: number;
  setupReason: string | null;
};

export type LiveQuizQuestionInput = {
  prompt: string;
  choices: [string, string, string, string];
  correctChoice: number;
  explanation: string;
  category: string;
};

export type LiveQuizSuggestionSummary = {
  id: string;
  prompt: string;
  status: LiveQuizQuestionStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveQuizAdminQuestion = LiveQuizQuestionInput & {
  id: string;
  source: "starter" | "admin" | "community" | string;
  status: LiveQuizQuestionStatus;
  submitterType: string;
  submitterName: string;
  submitterContext: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveQuizAdminData = {
  pending: LiveQuizAdminQuestion[];
  approved: LiveQuizAdminQuestion[];
  rejectedCount: number;
  archivedCount: number;
  pendingCount: number;
  approvedCount: number;
};
