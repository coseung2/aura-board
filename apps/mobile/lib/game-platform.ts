import { apiFetch } from "./api";
import type {
  MobileGameOutcome,
  MobileGameRecordRange,
  MobileOfficialGameKind,
} from "./game-platform-contract";

export type MobileGameConnectionState = "online" | "reconnecting" | "offline";
export type MobileGamePresentationPhase =
  | "loading"
  | "empty"
  | "unavailable"
  | "lobby"
  | "ready"
  | "active"
  | "reconnecting"
  | "interrupted"
  | "completed"
  | "won"
  | "lost"
  | "draw"
  | "forfeit"
  | "abandoned"
  | "host-ended"
  | "error";

export type MobileGameRecord = {
  id: string;
  gameKind: MobileOfficialGameKind;
  boardId: string;
  boardTitle: string;
  outcome: MobileGameOutcome;
  score: number | null;
  durationMs: number | null;
  metrics: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
};

export type MobileGameRecordsResponse = {
  schemaVersion: 1;
  appliedFilter: {
    gameKind: MobileOfficialGameKind | "all";
    range: MobileGameRecordRange;
    limit: number;
  };
  summary: {
    totalPlays: number;
    completedCount: number;
    bestScore: number | null;
    latestCompletedAt: string | null;
  };
  facets: Partial<Record<MobileOfficialGameKind, number>>;
  records: MobileGameRecord[];
  nextCursor: string | null;
};

export async function fetchOwnGameRecords(input: {
  gameKind: MobileOfficialGameKind | "all";
  range: MobileGameRecordRange;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<MobileGameRecordsResponse> {
  const query = new URLSearchParams({
    gameKind: input.gameKind,
    range: input.range,
    limit: String(input.limit ?? 20),
  });
  if (input.cursor) query.set("cursor", input.cursor);
  return apiFetch<MobileGameRecordsResponse>(
    `/api/student/game-records?${query.toString()}`,
    { signal: input.signal },
  );
}

export function mobileOutcomeLabel(outcome: MobileGameOutcome): string {
  switch (outcome) {
    case "win": return "승리";
    case "loss": return "패배";
    case "draw": return "무승부";
    case "completed": return "완료";
    case "forfeit": return "기권";
    case "abandoned": return "나감";
    case "host-ended": return "진행자 종료";
  }
}

export function lockMobileGamePresentation<T extends {
  connection: MobileGameConnectionState;
  phase: MobileGamePresentationPhase;
  inputLocked: boolean;
  statusMessage?: string | null;
}>(
  state: T,
  connection: MobileGameConnectionState,
): T {
  if (connection === "online") {
    return { ...state, connection, inputLocked: false };
  }
  return {
    ...state,
    connection,
    phase: connection === "offline" ? "interrupted" : "reconnecting",
    inputLocked: true,
    statusMessage:
      connection === "offline"
        ? "연결이 끊겼어요. 최신 상태를 확인할 때까지 입력할 수 없어요."
        : "최신 게임 상태를 다시 확인하고 있어요.",
  };
}
