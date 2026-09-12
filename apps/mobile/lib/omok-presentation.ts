import type { OmokMachineState } from "./omok-move-machine";
import { canPlaceStone } from "./omok-move-machine";
import type { OmokSocketStatus } from "./omok-socket";
import type { OmokSlot, OmokSnapshot } from "./omok-contract";
import { omokCoordinateLabel } from "./omok-geometry";

export function omokSlotLabel(slot: OmokSlot | null): string {
  if (slot === "first") return "흑";
  if (slot === "second") return "백";
  return "관전";
}

export type OmokTurnBanner = {
  text: string;
  emphasis: "mine" | "peer" | "neutral";
};

/** The turn banner is the strongest signal near the board. */
export function omokTurnBanner(state: OmokMachineState): OmokTurnBanner {
  const snapshot = state.snapshot;
  if (!snapshot) return { text: "대국을 불러오는 중", emphasis: "neutral" };
  if (snapshot.roomStatus === "finished") {
    return { text: omokOutcomeTitle(snapshot), emphasis: "neutral" };
  }
  if (snapshot.roomStatus !== "active") {
    return {
      text: snapshot.roomStatus === "ready" ? "곧 시작해요" : "준비를 기다리는 중",
      emphasis: "neutral",
    };
  }
  if (state.pending?.stone) {
    return {
      text: state.pending.phase === "confirming" ? "확인 중" : "두는 중",
      emphasis: "neutral",
    };
  }
  if (snapshot.viewer.role !== "participant") {
    return { text: `${omokSlotLabel(snapshot.game.nextTurn)} 차례`, emphasis: "neutral" };
  }
  return canPlaceStone(snapshot)
    ? { text: "내 차례", emphasis: "mine" }
    : { text: "상대 차례", emphasis: "peer" };
}

/** One short line under the banner. Empty when nothing needs saying. */
export function omokHintText(state: OmokMachineState): string {
  const snapshot = state.snapshot;
  if (!snapshot) return "";
  if (snapshot.roomStatus === "waiting") return "준비 완료를 누르면 대국을 시작할 수 있어요.";
  if (snapshot.roomStatus === "ready") return "상대가 준비되면 바로 시작해요.";
  if (snapshot.roomStatus === "finished") return "";
  if (state.pending?.stone) {
    return state.pending.phase === "confirming"
      ? "착수 결과를 확인하고 있어요. 잠시만 기다려 주세요."
      : "착수를 보내는 중이에요.";
  }
  if (state.aim) return `선택: ${omokCoordinateLabel(state.aim)} · 이 자리에 둘까요?`;
  if (canPlaceStone(snapshot)) return "판을 눌러 자리를 고르세요.";
  return "";
}

export function omokOutcomeTitle(snapshot: OmokSnapshot): string {
  const winner = snapshot.outcome?.winner ?? null;
  if (!winner) return "무승부";
  if (snapshot.viewer.slot === winner) return "승리";
  if (snapshot.viewer.role === "participant") return "패배";
  const name = snapshot.participants.find((participant) => participant.slot === winner);
  return `${name?.displayName ?? omokSlotLabel(winner)} 승리`;
}

export function omokOutcomeReason(snapshot: OmokSnapshot): string {
  switch (snapshot.outcome?.reason) {
    case "resignation":
      return "기권으로 끝났어요.";
    case "draw":
      return "판이 모두 채워졌어요.";
    case "five_in_a_row":
      return "다섯 돌이 이어졌어요.";
    default:
      return "대국이 끝났어요.";
  }
}

export function omokRematchMessage(
  snapshot: OmokSnapshot,
  canRematch: boolean,
): string {
  if (canRematch) return "새 판을 시작하면 두 사람 모두 새 대국으로 이동해요.";
  if (snapshot.viewer.role === "participant") {
    return "방장이 다시 대국을 시작하면 새 판으로 이동해요.";
  }
  return "이 대국에서는 새 판을 시작할 수 없어요.";
}

/**
 * Connection state is only surfaced when the player can act on it. A healthy
 * socket, and a degraded socket that HTTP recovery is still covering silently,
 * both stay invisible.
 */
export function omokConnectionNotice(
  socketStatus: OmokSocketStatus,
  options: { httpRecovering: boolean; offline: boolean },
): string | null {
  if (options.offline) {
    return "연결이 끊겼어요. 네트워크를 확인한 뒤 다시 시도해 주세요.";
  }
  if (socketStatus === "degraded") {
    return "새 수를 바로 받지 못하고 있어요. 최신 판을 다시 확인해 주세요.";
  }
  if (socketStatus !== "ready" && options.httpRecovering) {
    return "최신 판을 다시 확인하는 중이에요.";
  }
  return null;
}
