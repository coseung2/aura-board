"use client";

import { CharacterAvatar } from "./CharacterAvatar";
import { RarityBadge } from "./RarityBadge";
import type { AvatarItem } from "./types";

type Props = {
  item: AvatarItem;
  owned: boolean;
  equipped?: boolean;
  priceUnit?: string;
  disabled?: boolean;
  onEquip?: () => void;
  onUnequip?: () => void;
  onPurchase?: () => void;
  busy?: boolean;
};

export function ItemCard({
  item,
  owned,
  equipped,
  priceUnit = "",
  disabled,
  onEquip,
  onUnequip,
  onPurchase,
  busy,
}: Props) {
  const previewEquipped: Record<string, string | null> = { [item.slot]: item.id };

  return (
    <div className={`avatar-item-card${owned ? " is-owned" : ""}${equipped ? " is-equipped" : ""}`}>
      <div className="avatar-item-preview">
        <CharacterAvatar items={[item]} equipped={previewEquipped} size={64} ariaLabel={`${item.name} 미리보기`} />
      </div>
      <div className="avatar-item-info">
        <div className="avatar-item-name-row">
          <strong className="avatar-item-name">{item.name}</strong>
          <RarityBadge rarity={item.rarity} />
        </div>
        {item.description && (
          <p className="avatar-item-desc">{item.description}</p>
        )}
        <div className="avatar-item-actions">
          {onPurchase && !owned && (
            <button
              type="button"
              className="avatar-btn avatar-btn-primary"
              onClick={onPurchase}
              disabled={busy || disabled}
            >
              {busy ? "구매 중…" : `${item.price.toLocaleString()} ${priceUnit} 구매`}
            </button>
          )}
          {owned && onEquip && !equipped && (
            <button
              type="button"
              className="avatar-btn avatar-btn-secondary"
              onClick={onEquip}
              disabled={busy}
            >
              착용
            </button>
          )}
          {owned && equipped && onUnequip && (
            <button
              type="button"
              className="avatar-btn avatar-btn-ghost"
              onClick={onUnequip}
              disabled={busy}
            >
              해제
            </button>
          )}
          {owned && !onEquip && !onUnequip && (
            <span className="avatar-owned-badge">보유 중</span>
          )}
        </div>
      </div>
    </div>
  );
}
