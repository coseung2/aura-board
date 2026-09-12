/**
 * Same-frame submit guard.
 *
 * React state and refs updated inside an event handler are not visible to a
 * second handler running in the same JS frame, so a double tap could previously
 * produce two commands at one expectedVersion. This lock is acquired
 * synchronously before any state, persistence, or network work begins.
 */
export type OmokSubmitLock = {
  /** Returns false when a submission is already in flight. */
  acquire: () => boolean;
  release: () => void;
  isHeld: () => boolean;
};

export function createOmokSubmitLock(): OmokSubmitLock {
  let held = false;
  return {
    acquire: () => {
      if (held) return false;
      held = true;
      return true;
    },
    release: () => {
      held = false;
    },
    isHeld: () => held,
  };
}
