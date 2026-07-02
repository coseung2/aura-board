"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CategoryTabs } from "@/components/avatar/CategoryTabs";
import { CharacterAvatar } from "@/components/avatar/CharacterAvatar";
import { ErrorState } from "@/components/avatar/ErrorState";
import { ItemCard } from "@/components/avatar/ItemCard";
import { LoadingState } from "@/components/avatar/LoadingState";
import { useAvatarMe } from "@/components/avatar/useAvatarMe";

export function CharacterRoomClient() {
  const { status, data, error, reload } = useAvatarMe();
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localEquipped, setLocalEquipped] = useState<Record<string, string | null> | null>(null);

  const displayEquipped = localEquipped ?? data?.equipped ?? {};
  const unit = data?.currency.unitLabel ?? "";

  const ownedIds = useMemo(() => new Set(data?.inventoryItemIds ?? []), [data?.inventoryItemIds]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const owned = data.items.filter((item) => ownedIds.has(item.id));
    if (category === "all") return owned;
    return owned.filter((item) => item.category === category || item.slot === category);
  }, [data, ownedIds, category]);

  async function commitEquip(next: Record<string, string | null>) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/avatar/loadout", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          equips: Object.entries(next)
            .filter(([, itemId]) => itemId !== undefined)
            .map(([slot, itemId]) => ({ slot, itemId })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(typeof body.error === "string" ? body.error : "저장에 실패했어요");
        return;
      }
      setLocalEquipped(body.equipped ?? next);
    } catch {
      setSaveError("네트워크 오류로 저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  function handleEquip(itemId: string, slot: string) {
    const next = { ...displayEquipped, [slot]: itemId };
    setLocalEquipped(next);
    void commitEquip(next);
  }

  function handleUnequip(slot: string) {
    const next = { ...displayEquipped, [slot]: null };
    setLocalEquipped(next);
    void commitEquip(next);
  }

  async function toggleVisibility() {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/avatar/gallery/visibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visible: !data.galleryVisible }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(typeof body.error === "string" ? body.error : "설정 변경에 실패했어요");
        return;
      }
      await reload();
    } catch {
      setSaveError("네트워크 오류로 설정하지 못했어요");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return <LoadingState message="캐릭터 정보를 불러오는 중…" />;
  if (status === "error" || !data) return <ErrorState message={error ?? "불러오지 못했어요"} onRetry={reload} />;

  return (
    <main className="character-page character-room-page">
      <div className="character-page-header">
        <div>
          <h1 className="character-page-title">피팅룸</h1>
          <p className="character-page-subtitle">보유한 아이템을 장착해 보세요</p>
        </div>
        <div className="character-page-actions">
          <Link href="/student/character-shop" className="avatar-btn avatar-btn-secondary">
            상점 가기
          </Link>
          <Link href="/student/character-town" className="avatar-btn avatar-btn-ghost">
            마을 가기
          </Link>
        </div>
      </div>

      <div className="character-room-layout">
        <section className="character-preview-panel" aria-label="캐릭터 미리보기">
          <div className="character-preview-stage">
            <CharacterAvatar
              items={data.items}
              equipped={displayEquipped}
              size={220}
              ariaLabel="내 캐릭터 미리보기"
            />
          </div>
          <div className="character-preview-meta">
            <div className="character-balance-chip">
              <span>보유 {data.balance.toLocaleString()} {unit}</span>
            </div>
            <button
              type="button"
              className="avatar-btn avatar-btn-ghost"
              onClick={toggleVisibility}
              disabled={saving}
              aria-pressed={data.galleryVisible}
            >
              {data.galleryVisible ? "마을에 보이기 중" : "마을에 숨기기"}
            </button>
          </div>
          {saveError && <p className="character-form-error" role="alert">{saveError}</p>}
        </section>

        <section className="character-inventory-panel" aria-label="아이템 목록">
          <CategoryTabs active={category} onChange={setCategory} />

          {filteredItems.length === 0 ? (
            <div className="avatar-empty">
              {category === "all"
                ? "아직 보유한 아이템이 없어요. 상점에서 구매해 보세요."
                : "이 카테고리에 보유한 아이템이 없어요."}
            </div>
          ) : (
            <div className="avatar-item-grid">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  owned
                  equipped={displayEquipped[item.slot] === item.id}
                  onEquip={() => handleEquip(item.id, item.slot)}
                  onUnequip={() => handleUnequip(item.slot)}
                  busy={saving}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
