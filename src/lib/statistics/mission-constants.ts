export const STATISTICS_MISSION_COUNT = 12;

export const STATISTICS_APPROVAL_GATES = [2, 3, 4, 7, 9];

export function isValidStatisticsMissionStep(stepNumber: number): boolean {
  return (
    Number.isInteger(stepNumber) &&
    stepNumber >= 1 &&
    stepNumber <= STATISTICS_MISSION_COUNT
  );
}
