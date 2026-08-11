import { apiFetch } from "./api";

export type TitleProgress = {
  key: string;
  label: string;
  imagePath: string;
  requirement: string;
  effectKey: string;
  buffBps: number;
  earned: boolean;
  claimed: boolean;
};

/** Claim one earned title so it can be equipped on the student's pets. */
export async function claimTitle(titleKey: string) {
  return apiFetch<{ titles: TitleProgress[] }>("/api/student/titles", {
    method: "POST",
    json: { titleKey },
  });
}

/** Equip or clear (`null`) the title worn by one pet, identified by color. */
export async function equipPetTitle(color: string, titleKey: string | null) {
  return apiFetch<{ color: string; equippedTitleKey: string | null }>(
    "/api/student/titles/equip",
    { method: "PATCH", json: { color, titleKey } },
  );
}

export async function fetchTitles() {
  return apiFetch<{ walking: TitleProgress[]; reading: TitleProgress[] }>(
    "/api/student/titles",
  );
}
