"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CategoryTabs } from "@/components/avatar/CategoryTabs";
import { ErrorState } from "@/components/avatar/ErrorState";
import { ItemCard } from "@/components/avatar/ItemCard";
import { LoadingState } from "@/components/avatar/LoadingState";
import { useAvatarShop } from "@/components/avatar/useAvatarShop";

export function CharacterShopClient() {
  const { status, data, error, reload } = useAvatarShop();
  const [category, setCategory] = useState("all");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const unit = data?.currency.unitLabel ?? "";
  const ownedIds = useMemo(() => new Set(data?.inventoryItemIds ?? []), [data?.inventoryItemIds]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (category === "all") return data.items;
    return data.items.filter((item) => item.category === category || item.slot === category);
  }, [data, category]);

  async function handlePurchase(itemId: string) {
    if (!data) return;
    setPurchasingId(itemId);
    setPurchaseError(null);
    try {
      const res = await fetch("/api/avatar/shop/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPurchaseError(typeof body.error === "string" ? body.error : "구매에 실패했어요");
        return;
      }
      await reload();
    } catch {
      setPurchaseError("네트워크 오류로 구매하지 못했어요");
    } finally {
      setPurchasingId(null);
    }
  }

  if (status === "loading") return <LoadingState message="상점 정보를 불러오는 중…" />;
  if (status === "error" || !data) return <ErrorState message={error ?? "불러오지 못했어요"} onRetry={reload} />;

  return (
    <main className="character-page character-shop-page">
      <div className="character-page-header">
        <div>
          <h1 className="character-page-title">상점</h1>
          <p className="character-page-subtitle">아이템을 구매해서 나만의 캐릭터를 꾸며보세요</p>
        </div>
        <div className="character-page-actions">
          <div className="character-balance-chip is-large">
            <span>{data.balance.toLocaleString()} {unit}</span>
          </div>
          <Link href="/student/character-room" className="avatar-btn avatar-btn-secondary">
            피팅룸 가기
          </Link>
          <Link href="/student/reading-champions" className="avatar-btn avatar-btn-ghost">
            전시공간
          </Link>
        </div>
      </div>

      {purchaseError && (
        <p className="character-form-error" role="alert">{purchaseError}</p>
      )}

      <CategoryTabs active={category} onChange={setCategory} />

      {filteredItems.length === 0 ? (
        <div className="avatar-empty">
          {category === "all"
            ? "상점에 아이템이 없어요."
            : "이 카테고리에 아이템이 없어요."}
        </div>
      ) : (
        <div className="avatar-item-grid">
          {filteredItems.map((item) => {
            const owned = ownedIds.has(item.id);
            const insufficient = data.balance < item.price;
            return (
              <ItemCard
                key={item.id}
                item={item}
                owned={owned}
                priceUnit={unit}
                disabled={insufficient}
                onPurchase={!owned ? () => handlePurchase(item.id) : undefined}
                busy={purchasingId === item.id}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
