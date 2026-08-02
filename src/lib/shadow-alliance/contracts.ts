export type ShadowAlliancePhase =
  | "lobby"
  | "playing"
  | "revealing"
  | "postround"
  | "finished"
  | "host-ended";

export type ShadowAllianceTeam = "unassigned" | "black" | "white";

export type ShadowAllianceRoundResult = {
  round: number;
  command: number;
  winner: "black" | "white" | "tie";
  blackAverage: number | null;
  whiteAverage: number | null;
  blackDifference: number | null;
  whiteDifference: number | null;
  players: Array<{
    studentId: string;
    name: string;
    team: ShadowAllianceTeam;
    number: number | null;
    gain: number;
  }>;
};

export type ShadowAllianceSnapshot = {
  id: string;
  boardId: string;
  classroomId: string;
  version: number;
  phase: ShadowAlliancePhase;
  terminalReason: "completed" | "host_ended" | null;
  round: number;
  totalRounds: number;
  command: number | null;
  editable: boolean;
  timeLeftMs: number;
  timerRunning: boolean;
  startedAt: number | null;
  completedAt: number | null;
  participants: Array<{
    studentId: string;
    name: string;
    team: ShadowAllianceTeam;
    joinedAt: number | null;
    readyAt: number | null;
    forfeitedAt: number | null;
    power: number;
    lastGain: number;
    roundWins: number;
    submitted: boolean;
    isSelf: boolean;
    ownNumber?: number | null;
  }>;
  lastResult: ShadowAllianceRoundResult | null;
  allSubmitted: boolean;
};
