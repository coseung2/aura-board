import type {
  GameConnectionState,
  GamePresentationAction,
  GamePresentationPhase,
  OfficialGameKind,
} from "./contracts";

export type GamePresentationRole = "host" | "participant" | "spectator";

export type GamePresentationActionState = {
  action: GamePresentationAction;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  destructive?: boolean;
};

export type GamePresentationState = {
  gameKind: OfficialGameKind;
  phase: GamePresentationPhase;
  connection: GameConnectionState;
  role: GamePresentationRole;
  title: string;
  roundLabel?: string | null;
  timeLeftMs?: number | null;
  score?: number | null;
  scoreLabel?: string | null;
  rulesLabel?: string | null;
  statusMessage?: string | null;
  resultId?: string | null;
  inputLocked: boolean;
  actions: readonly GamePresentationActionState[];
};

export function lockPresentationForReconnect(
  state: GamePresentationState,
  connection: GameConnectionState,
): GamePresentationState {
  if (connection === "online") {
    return {
      ...state,
      connection,
      inputLocked: false,
    };
  }
  return {
    ...state,
    phase: connection === "offline" ? "interrupted" : "reconnecting",
    connection,
    inputLocked: true,
    statusMessage:
      connection === "offline"
        ? "연결이 끊겼어요. 입력은 최신 상태를 확인할 때까지 잠겨요."
        : "최신 게임 상태를 다시 확인하고 있어요.",
  };
}

export function isTerminalPresentationPhase(
  phase: GamePresentationPhase,
): boolean {
  return [
    "completed",
    "won",
    "lost",
    "draw",
    "forfeit",
    "abandoned",
    "host-ended",
  ].includes(phase);
}
