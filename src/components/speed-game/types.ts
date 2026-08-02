export type SpeedGameStatus = "waiting" | "active" | "finished";

export type SpeedGameRound = {
  id: string;
  order: number;
  keyword: string;
  guesserSlot: number;
  startedAt: string | null;
  endedAt: string | null;
};

export type SpeedGameAnswer = {
  id: string;
  roundId: string;
  groupId: string;
  studentId: string;
  answer: string;
  correct: boolean | null;
  elapsedMs: number;
  rank: number | null;
  score: number | null;
  createdAt: string;
};

export type SpeedGameGroup = {
  id: string;
  name: string;
  studentIds: string[];
};

export type SpeedGameLeaderboardEntry = {
  groupId: string;
  groupName: string;
  score: number;
};

export type SpeedGameWire = {
  id: string;
  runId: string;
  version: number;
  terminalReason: "completed" | "participant_forfeit" | "host_ended" | null;
  boardId: string;
  boardSlug: string;
  classroomId: string;
  status: SpeedGameStatus;
  roundIndex: number;
  answerMode: "exact" | "normalize-space" | "teacher-approval";
  baseScore: number;
  minScore: number;
  bonusRanks: number[];
  timeLimitMs: number;
  rounds: SpeedGameRound[];
  answers: SpeedGameAnswer[];
  groups: SpeedGameGroup[];
  participants: Array<{
    studentId: string;
    groupId: string;
    name: string;
    invitedAt: string;
    joinedAt: string | null;
    readyAt: string | null;
    forfeitedAt: string | null;
  }>;
  leaderboard: SpeedGameLeaderboardEntry[];
};
