/** CSS px on web, logical layout units on native. Renderer pixels stay separate. */
export const PARTICIPANT_PET_SIZES = [40, 44, 48, 56, 64, 96] as const;
export type ParticipantPetSize = (typeof PARTICIPANT_PET_SIZES)[number];

/** Contain the complete renderer canvas, including expanded prop animations. */
export function fitParticipantPet(width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (![width, height, canvasWidth, canvasHeight].every((value) => Number.isFinite(value) && value > 0)) return null;
  const inset = Math.min(width, height) >= 64 ? 6 : 4;
  const scale = Math.min((width - inset * 2) / canvasWidth, (height - inset * 2) / canvasHeight);
  if (scale <= 0) return null;
  return { scale, width: canvasWidth * scale, height: canvasHeight * scale, inset };
}
