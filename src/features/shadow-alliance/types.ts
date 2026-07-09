export type ShadowAllianceTeam = "black" | "white";

export type ShadowAlliancePhase =
  | "lobby"
  | "playing"
  | "revealing"
  | "postround"
  | "final";

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
