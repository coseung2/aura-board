export type ShadowAllianceTeam = "black" | "white";

export type ShadowAlliancePhase =
  | "lobby"
  | "playing"
  | "revealing"
  | "postround"
  | "final";

export type ShadowAllianceBoardStatus = "waiting" | "active" | "ended";

export function getShadowAllianceBoardStatus(
  phase: ShadowAlliancePhase,
): ShadowAllianceBoardStatus {
  if (phase === "lobby") return "waiting";
  if (phase === "final") return "ended";
  return "active";
}

export const SHADOW_ALLIANCE_STATUS_LABELS: Record<ShadowAllianceBoardStatus, string> = {
  waiting: "시작 대기",
  active: "진행 중",
  ended: "종료",
};

export type ShadowAlliancePlayer = {
  id: string;
  nick: string;
  team: ShadowAllianceTeam;
  power: number;
  number: number | null;
  lastGain: number;
};

export type ShadowAllianceResult = {
  command: number;
  winner: ShadowAllianceTeam | "tie";
  blackAvg: number | null;
  whiteAvg: number | null;
  blackDiff: number | null;
  whiteDiff: number | null;
  black: ShadowAlliancePlayer[];
  white: ShadowAlliancePlayer[];
  gains: Record<string, number>;
};

export type ShadowAllianceGame = {
  phase: ShadowAlliancePhase;
  totalRounds: number;
  round: number;
  command: number | null;
  editable: boolean;
  timerSec: number;
  timeLeft: number;
  timerRunning: boolean;
  players: ShadowAlliancePlayer[];
  usedNicknames: string[];
  lastResult: ShadowAllianceResult | null;
  history: ShadowAllianceResult[];
};

export type ShadowAlliancePlayerSnapshot = Omit<
  ShadowAlliancePlayer,
  "number"
> & {
  submitted: boolean;
};

export type ShadowAllianceSnapshot = {
  phase: ShadowAlliancePhase;
  totalRounds: number;
  round: number;
  command: number | null;
  editable: boolean;
  timeLeft: number;
  timerRunning: boolean;
  players: ShadowAlliancePlayerSnapshot[];
  lastResult: ShadowAllianceResult | null;
};

export type ShadowAllianceConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";
