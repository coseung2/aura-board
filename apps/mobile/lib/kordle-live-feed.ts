export type KordleLiveEvent = {
  id: string;
  name: string;
  guessIndex: number;
  correctCount: number;
  isCorrect: boolean;
  createdAt: string;
};

const MAX_EVENTS = 18;

export function mergeKordleLiveEvents(
  current: KordleLiveEvent[],
  incoming: KordleLiveEvent[],
): KordleLiveEvent[] {
  const seen = new Set(current.map((event) => event.id));
  const fresh = incoming.filter(
    (event) =>
      !seen.has(event.id) && (event.isCorrect || event.correctCount > 0),
  );
  if (fresh.length === 0) return current;
  return [...current, ...fresh]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-MAX_EVENTS);
}
