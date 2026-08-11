import type { SpeedGameAnswer, SpeedGameWire } from "./types";

export type RunAction = "start" | "next" | "finish" | "end-early" | "rematch";
export type ParticipantAction = "join" | "ready" | "forfeit";

export type CommandErrorBody = {
  error?: string;
  game?: SpeedGameWire;
};

export type PendingCommand = {
  requestId: string;
  runId: string;
  expectedVersion: number;
  fingerprint: string;
};

export const FALLBACK_BASE_DELAY_MS = 15_000;
export const FALLBACK_MAX_DELAY_MS = 60_000;
export type RefreshResult = "updated" | "failed" | "terminal" | "skipped";

export function makeRequestId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function errorMessage(code: string | undefined): string {
  switch (code) {
    case "version_conflict":
      return "다른 기기에서 게임 상태가 바뀌었어요. 최신 상태를 반영했습니다.";
    case "idempotency_key_reuse":
      return "이 요청은 다른 내용으로 이미 사용됐어요. 다시 시도해 주세요.";
    case "not_current_guesser":
      return "이번 라운드의 답변 순서가 아니에요.";
    case "already_answered":
      return "우리 모둠은 이미 답을 제출했어요.";
    case "participant_not_invited":
      return "이 게임의 참가자 명단에 없어요.";
    case "participant_forfeited":
      return "이미 게임에서 나간 참가자예요.";
    case "game_not_running":
    case "round_not_active":
      return "현재 답을 제출할 수 있는 라운드가 아니에요.";
    case "already_last_round":
      return "마지막 라운드예요. 게임을 종료해 주세요.";
    case "run_not_terminal":
      return "게임이 끝난 뒤에 다시 시작할 수 있어요.";
    case "game_already_started":
      return "게임이 이미 시작되어 준비 상태를 바꿀 수 없어요.";
    default:
      return "요청을 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
  }
}

export async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export function participantState(participant: SpeedGameWire["participants"][number]) {
  if (participant.forfeitedAt) return "forfeited" as const;
  if (participant.readyAt) return "ready" as const;
  if (participant.joinedAt) return "joined" as const;
  return "invited" as const;
}

export function answerForRound(
  game: SpeedGameWire,
  roundId: string,
  groupId: string,
): SpeedGameAnswer | undefined {
  return game.answers.find(
    (answer) => answer.roundId === roundId && answer.groupId === groupId,
  );
}
