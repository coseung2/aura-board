import styles from "./SlimePetPage.module.css";
import { slimeBuffChipTier } from "./SlimeShopPresentation";

const BUFF_TIER_ICON: Record<"bronze" | "silver" | "gold", string> = {
  bronze: "/ui/buff-tiers/buff-tier-bronze.png",
  silver: "/ui/buff-tiers/buff-tier-silver.png",
  gold: "/ui/buff-tiers/buff-tier-gold.png",
};

type SlimeBuffTierChipProps = {
  label: string;
  bps: number;
};

/** Shared visual metadata chip used by character and item catalog cards. */
export function SlimeBuffTierChip({ label, bps }: SlimeBuffTierChipProps) {
  const tier = slimeBuffChipTier(bps);
  return (
    <span
      className={styles.itemPreviewBuff}
      aria-hidden="true"
      data-buff-tier={tier}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BUFF_TIER_ICON[tier]}
        alt=""
        className={styles.itemPreviewBuffIcon}
        draggable={false}
      />
      <span className={styles.itemPreviewBuffText}>{label}</span>
    </span>
  );
}
