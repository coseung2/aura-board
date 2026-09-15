import type { OfficialGameKind } from "./contracts";

export type HubPhase = "open" | "waiting" | "active" | "paused";
export type HubStatus = { phase: HubPhase; label: string; playerCount: number };
type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export const OPEN_HUB_STATUS: HubStatus = { phase: "open", label: "입장 가능", playerCount: 0 };

/** These are acknowledged game entrants, NOT a claim that their socket is online. */
export function playHubStatus(kind: OfficialGameKind, value: unknown, completedAt: unknown = null): HubStatus {
  const aggregate = asRecord(value);
  const state = asRecord(aggregate.state);
  const phase = String(state.phase ?? state.roomStatus ?? "");
  if (completedAt != null || ["finished", "host-ended", "host_ended", "final"].includes(phase)) {
    return { ...OPEN_HUB_STATUS };
  }
  const raw = kind === "shadow-alliance" ? aggregate.participants : state.participants;
  const participants = Array.isArray(raw) ? raw.map(asRecord) : Object.values(asRecord(raw)).map(asRecord);
  const playerCount = participants.filter((participant) => {
    if (participant.forfeitedAtMs != null || participant.leftAtMs != null) return false;
    if (kind === "song-guess") return participant.joined === true || (aggregate.rulesVersion === 1 && participant.joined == null);
    if (kind === "shadow-alliance") return participant.joinedAtMs != null;
    return true;
  }).length;
  if (kind === "shadow-alliance" && phase === "playing" && (state.pausedRemainingMs != null || state.timerRunning === false)) {
    return { phase: "paused", label: "일시정지", playerCount };
  }
  if (["active", "playing", "guessing", "reveal", "revealing", "postround"].includes(phase)) {
    return { phase: "active", label: "진행 중", playerCount };
  }
  return { phase: "waiting", label: "대기 중", playerCount };
}

export function combineHubStatus(current: HubStatus, next: HubStatus): HubStatus {
  const priority: Record<HubPhase, number> = { active: 4, paused: 3, waiting: 2, open: 1 };
  if (next.phase === "open") return current;
  const chosen = priority[next.phase] > priority[current.phase] ? next : current;
  return { ...chosen, playerCount: current.playerCount + next.playerCount };
}
