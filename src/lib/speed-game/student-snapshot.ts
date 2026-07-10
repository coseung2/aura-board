type StudentSnapshotShape = {
  roundIndex: number;
  rounds: Array<{ keyword: string; guesserSlot: number }>;
  groups: Array<{ studentIds: string[] }>;
};

/**
 * Future words are hidden from every student. The active word is also hidden
 * from the student whose slot is guessing, while explainers can still see it.
 */
export function sanitizeGameSnapshotForStudent<T extends StudentSnapshotShape>(
  snapshot: T,
  studentId: string,
): T {
  const group = snapshot.groups.find((candidate) =>
    candidate.studentIds.includes(studentId),
  );
  const studentSlot = group ? group.studentIds.indexOf(studentId) + 1 : 0;

  return {
    ...snapshot,
    rounds: snapshot.rounds.map((round, index) => ({
      ...round,
      keyword:
        index > snapshot.roundIndex ||
        (index === snapshot.roundIndex && studentSlot === round.guesserSlot)
          ? ""
          : round.keyword,
    })),
  } as T;
}
