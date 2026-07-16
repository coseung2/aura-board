"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PET_LINEAGES,
  PET_PRODUCTS,
  getPetLineage,
  type PetProduct,
} from "@/lib/pets/catalog";
import styles from "./PetSanctuary.module.css";

import { type Pet, type PetActionPayload, type PetHome as Home, type PetShopFilter as ShopFilter, type PetTab as Tab } from "./model";
import { CollectionView, DexView, FittingView, FrontView, ShopView } from "./PetViews";

const ERROR_LABELS: Record<string, string> = {
  unauthenticated: "학생 로그인이 필요해요.",
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 가지고 있는 효과예요.",
  product_not_found: "상점 상품을 찾지 못했어요.",
  pet_not_found: "펫을 찾지 못했어요.",
  item_not_owned: "필요한 아이템이 없어요.",
  wrong_item_kind: "이 행동에는 사용할 수 없는 아이템이에요.",
  not_ready: "아직 부화하거나 진화할 준비가 되지 않았어요.",
  invalid_name: "이름은 12자 안으로 지어 주세요.",
  invalid_body: "요청 내용을 다시 확인해 주세요.",
};

const TAB_ITEMS: Array<{ id: Tab; label: string; caption: string }> = [
  { id: "front", label: "프론트", caption: "움직이는 내 펫" },
  { id: "collection", label: "수집함", caption: "알·성장·진화" },
  { id: "shop", label: "상점", caption: "알·먹이·효과" },
  { id: "fitting", label: "피팅룸", caption: "대표 펫·배경" },
  { id: "dex", label: "도감", caption: "7종 21단계" },
];

export function PetSanctuary() {
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("front");
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [actionId, setActionId] = useState("idle");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pets", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(ERROR_LABELS[body.error] ?? "펫 정보를 불러오지 못했어요.");
      setHome(body as Home);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "펫 정보를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!home) return;
    const stillExists = selectedPetId && home.pets.some((pet) => pet.id === selectedPetId);
    if (!stillExists) {
      setSelectedPetId(home.pets.find((pet) => pet.equipped)?.id ?? home.pets[0]?.id ?? null);
    }
  }, [home, selectedPetId]);

  const selectedPet = useMemo(
    () => home?.pets.find((pet) => pet.id === selectedPetId) ?? home?.pets.find((pet) => pet.equipped) ?? home?.pets[0] ?? null,
    [home, selectedPetId],
  );
  const selectedLineage = selectedPet ? getPetLineage(selectedPet.lineageId) : null;

  useEffect(() => {
    setNickname(selectedPet?.nickname ?? "");
  }, [selectedPet?.id, selectedPet?.nickname]);

  useEffect(() => {
    if (!selectedLineage) return;
    if (!selectedLineage.behaviorRows.some((row) => row.id === actionId)) setActionId("idle");
  }, [selectedLineage, actionId]);

  const purchase = async (product: PetProduct) => {
    if (!home) return;
    setBusyKey(`buy:${product.key}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/pets/purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productKey: product.key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(ERROR_LABELS[body.error] ?? "구매하지 못했어요.");
      setHome(body.home as Home);
      if (body.purchase?.lineageId) {
        const lineage = getPetLineage(body.purchase.lineageId);
        setNotice(`${lineage?.egg.name ?? "새 알"}을(를) 수집함에 넣었어요!`);
        setTab("collection");
        setSelectedPetId(body.purchase.petId ?? null);
      } else {
        setNotice(`${body.purchase?.productName ?? product.name} 구매 완료!`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "구매하지 못했어요.");
    } finally {
      setBusyKey(null);
    }
  };

  const act = async (payload: PetActionPayload, successMessage: string) => {
    setBusyKey(`${payload.action}:${payload.petId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/pets/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(ERROR_LABELS[body.error] ?? "행동을 완료하지 못했어요.");
      setHome(body.home as Home);
      setNotice(body.event === "hatched" ? "알이 부화했어요! 새로운 친구를 확인해 보세요." : successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "행동을 완료하지 못했어요.");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !home) {
    return <StateCard title="원소 펫 공간을 여는 중…" description="알과 도감 정보를 불러오고 있어요." />;
  }
  if (!home) {
    return <StateCard title="펫 공간을 열지 못했어요" description={error ?? "잠시 후 다시 시도해 주세요."} action={<button onClick={() => void load()}>다시 불러오기</button>} />;
  }

  const filteredProducts = PET_PRODUCTS.filter((product) => {
    if (shopFilter === "all") return true;
    if (shopFilter === "egg") return product.kind === "egg";
    if (shopFilter === "care") return product.kind === "food" || product.kind === "accelerator";
    return product.kind === "background";
  });

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>AURA ELEMENTAL PETS</span>
          <h1>{home.student.name}의 원소 펫</h1>
          <p>알을 부화시키고, 먹이를 주고, 세 단계로 진화시키며 7개 원소 도감을 완성해요.</p>
        </div>
        <div className={styles.wallet}>
          <span>보유 화폐</span>
          <strong>{home.balance.toLocaleString()} {home.currency.unitLabel}</strong>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="원소 펫 메뉴">
        {TAB_ITEMS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? styles.tabActive : ""} onClick={() => setTab(item.id)}>
            <strong>{item.label}</strong><span>{item.caption}</span>
          </button>
        ))}
      </nav>

      {(notice || error) && (
        <div className={error ? styles.alertError : styles.alertSuccess} role={error ? "alert" : "status"}>
          <span>{error ?? notice}</span>
          <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="알림 닫기">×</button>
        </div>
      )}

      {tab === "front" && (
        <FrontView
          home={home}
          pet={selectedPet}
          lineage={selectedLineage}
          actionId={actionId}
          onActionChange={setActionId}
          onSelectPet={setSelectedPetId}
          onGoShop={() => setTab("shop")}
          onGoCollection={() => setTab("collection")}
          onAct={act}
          busyKey={busyKey}
        />
      )}

      {tab === "collection" && (
        <CollectionView home={home} selectedPetId={selectedPet?.id ?? null} onSelectPet={setSelectedPetId} onAct={act} busyKey={busyKey} onGoShop={() => setTab("shop")} />
      )}

      {tab === "shop" && (
        <ShopView home={home} products={filteredProducts} filter={shopFilter} onFilter={setShopFilter} onPurchase={purchase} busyKey={busyKey} />
      )}

      {tab === "fitting" && (
        <FittingView home={home} pet={selectedPet} lineage={selectedLineage} nickname={nickname} onNickname={setNickname} onSelectPet={setSelectedPetId} onAct={act} busyKey={busyKey} />
      )}

      {tab === "dex" && <DexView home={home} />}
    </main>
  );
}

function StateCard({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <main className={styles.page}><section className={styles.stateCard}><div className={styles.stateOrb} /><h1>{title}</h1><p>{description}</p>{action}</section></main>;
}
