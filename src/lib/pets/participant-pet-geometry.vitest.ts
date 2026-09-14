import { describe, expect, it } from "vitest";
import { fitParticipantPet, PARTICIPANT_PET_SIZES } from "./participant-pet-geometry";

describe("participant pet containment", () => {
  it.each(PARTICIPANT_PET_SIZES)("contains normal, expanded, tall and wide scenes in a %ipx holder", (size) => {
    for (const [width, height] of [[64, 64], [96, 96], [96, 145], [128, 96]]) {
      const fit = fitParticipantPet(size, size, width, height)!;
      expect(fit.width + fit.inset * 2).toBeLessThanOrEqual(size + 0.000001);
      expect(fit.height + fit.inset * 2).toBeLessThanOrEqual(size + 0.000001);
      expect(fit.width / fit.height).toBeCloseTo(width / height);
    }
  });
  it("uses the actual responsive holder, including narrow podiums", () => {
    const fit = fitParticipantPet(70, 96, 96, 120)!;
    expect(fit.width).toBeLessThanOrEqual(58);
    expect(fit.height).toBeLessThanOrEqual(84);
  });
  it("does not paint before valid dimensions are measured", () => {
    expect(fitParticipantPet(0, 56, 64, 64)).toBeNull();
    expect(fitParticipantPet(56, 56, NaN, 64)).toBeNull();
  });
});
