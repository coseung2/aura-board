"use client";

import { prioritizeEquippedSlimeItems } from "@/lib/pets/item-visibility";
import { formatBpsPercent } from "@/lib/pets/math";
import type { SlimeColor } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import type { ClaimedTitle } from "./SlimePetModel";

type SlimeWardrobeTitleListProps = {
  wardrobeColor: SlimeColor;
  claimedTitles: readonly ClaimedTitle[];
  equippedTitleKey: string | null;
  busyTitleColor: SlimeColor | null;
  busyItemKey: string | null;
  onEquipTitle?: (color: SlimeColor, titleKey: string | null) => void;
};

/** Wardrobe-only title catalog with equipped-first ordering and save state. */
export function SlimeWardrobeTitleList({
  wardrobeColor,
  claimedTitles,
  equippedTitleKey,
  busyTitleColor,
  busyItemKey,
  onEquipTitle,
}: SlimeWardrobeTitleListProps) {
  if (claimedTitles.length === 0) {
    return (
      <ul className={styles.wardrobeList} aria-label="칭호 목록">
        <li className={styles.emptyState}>
          걷기와 독서 미션에서 칭호를 받아 오세요.
        </li>
      </ul>
    );
  }

  const orderedTitles = prioritizeEquippedSlimeItems(
    claimedTitles,
    equippedTitleKey ? [equippedTitleKey] : [],
  );
  return (
    <ul className={styles.wardrobeList} aria-label="칭호 목록">
      {orderedTitles.map((title) => {
        const equipped = equippedTitleKey === title.key;
        const busy =
          busyTitleColor === wardrobeColor || busyItemKey === title.key;
        return (
          <li
            key={title.key}
            className={[
              styles.wardrobeItem,
              equipped ? styles.wardrobeItemEquipped : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-selected={equipped}
            data-equipped={equipped ? "true" : "false"}
          >
            <div className={styles.wardrobePreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={title.imagePath}
                alt=""
                aria-hidden="true"
                className={styles.titlePreviewImage}
              />
            </div>
            <div className={styles.wardrobeCardBody}>
              <div className={styles.wardrobeItemCopy}>
                <h3>{title.label}</h3>
                <p>+{formatBpsPercent(title.buffBps)}</p>
              </div>
              <div className={styles.wardrobeItemActions}>
                <button
                  type="button"
                  className={`${styles.wardrobeInlineAction} ${
                    equipped
                      ? styles.wardrobeInlineActionDanger
                      : styles.wardrobeInlineActionPrimary
                  }`}
                  disabled={busyTitleColor !== null || busyItemKey !== null}
                  onClick={() =>
                    onEquipTitle?.(
                      wardrobeColor,
                      equipped ? null : title.key,
                    )
                  }
                  aria-pressed={equipped}
                  aria-label={`${title.label} 칭호 ${equipped ? "해제" : "장착"}`}
                >
                  {busy ? "처리 중…" : equipped ? "해제" : "장착"}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
