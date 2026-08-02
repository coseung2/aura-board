import type { SpeedGameWire } from "@/components/speed-game/types";

/**
 * Removes teacher-only answers and future keywords from a Speed Game snapshot.
 * The authoritative run identity, version, roster, timing, and public scores are
 * preserved so web and Expo can reconcile the same state machine.
 */
export function sanitizeGameSnapshotForStudent(
  game: SpeedGameWire,
  studentId: string,
): SpeedGameWire {
  const ownGroup = game.groups.find((group) => group.studentIds.includes(studentId));
  const ownMemberIndex = ownGroup?.studentIds.indexOf(studentId) ?? -1;
  const revealAllAnswers = game.status === "finished";
  return {
    ...game,
    rounds: game.rounds.map((round) => ({
      ...round,
      keyword:
        game.status === "finished" ||
        round.order < game.roundIndex ||
        (round.order === game.roundIndex &&
          ownMemberIndex >= 0 &&
          ownMemberIndex + 1 !== round.guesserSlot)
          ? round.keyword
          : "",
    })),
    answers: game.answers.map((answer) => {
      const maySeeText = revealAllAnswers || answer.groupId === ownGroup?.id;
      return {
        ...answer,
        answer: maySeeText ? answer.answer : "",
      };
    }),
  };
}
