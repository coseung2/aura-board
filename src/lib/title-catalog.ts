import { READING_TITLES } from "./reading-titles";
import { WALKING_TITLES } from "./walking-titles";

export type TitleDomain = "walking" | "reading";

export type TitleDefinition = {
  key: string;
  label: string;
  imagePath: string;
  requirement: string;
  effectKey: string;
  buffBps: number;
  domain: TitleDomain;
};

/** Every title in the product, keyed for claim validation and buff lookups. */
export const TITLE_DEFINITIONS: TitleDefinition[] = [
  ...WALKING_TITLES.map((title) => ({
    key: title.key,
    label: title.label,
    imagePath: title.imagePath,
    requirement: title.requirement,
    effectKey: title.effectKey as string,
    buffBps: title.buffBps,
    domain: "walking" as TitleDomain,
  })),
  ...READING_TITLES.map((title) => ({
    key: title.key,
    label: title.label,
    imagePath: title.imagePath,
    requirement: title.requirement,
    effectKey: title.effectKey as string,
    buffBps: title.buffBps,
    domain: "reading" as TitleDomain,
  })),
];

export function getTitleDefinition(titleKey: string): TitleDefinition | null {
  return TITLE_DEFINITIONS.find((title) => title.key === titleKey) ?? null;
}
