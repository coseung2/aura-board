"use client";

import type { ChangeEvent } from "react";
import {
  PET_BACKGROUND_PRODUCTS,
  PET_LINEAGES,
  getPetLineage,
  getPetProduct,
  type PetLineageDefinition,
  type PetProduct,
} from "@/lib/pets/catalog";
import { type Pet, type PetActionPayload, type PetHome, type PetShopFilter as ShopFilter } from "./model";
import { MiniMeter, PetSprite, ProgressBlock, WanderingPet } from "./PetStage";
import styles from "./PetSanctuary.module.css";

const backgroundClass = (key: string | null): string => {
  const background = key ? getPetProduct(key)?.backgroundClass : null;
  if (background === "meadow") return styles.backgroundMeadow;
  if (background === "riverlight") return styles.backgroundRiverlight;
  if (background === "ember") return styles.backgroundEmber;
  if (background === "aurora") return styles.backgroundAurora;
  return styles.backgroundDefault;
};

const petDisplayName = (pet: Pet, lineage: PetLineageDefinition): string => {
  if (pet.nickname) return pet.nickname;
  if (pet.stage === 0) return lineage.egg.name;
  return lineage.stages[pet.stage - 1]?.name ?? lineage.stages[0].name;
};

const productOwned = (home: PetHome, product: PetProduct): boolean =>
  Boolean(product.durable && product.itemKey && (home.inventory[product.itemKey] ?? 0) > 0);

export function FrontView({
  home,
  pet,
  lineage,
  actionId,
  onActionChange,
  onSelectPet,
  onGoShop,
  onGoCollection,
  onAct,
  busyKey,
}: {
  home: PetHome;
  pet: Pet | null;
  lineage: PetLineageDefinition | null;
  actionId: string;
  onActionChange: (value: string) => void;
  onSelectPet: (value: string) => void;
  onGoShop: () => void;
  onGoCollection: () => void;
  onAct: (payload: PetActionPayload, message: string) => Promise<void>;
  busyKey: string | null;
}) {
  if (!pet || !lineage) {
    return (
      <section className={styles.emptyStage}>
        <div className={styles.emptyEgg}>🥚</div>
        <h2>아직 함께 지낼 알이 없어요</h2>
        <p>랜덤 알은 가장 저렴하고, 원하는 원소 알은 결과가 확정돼요.</p>
        <button type="button" className={styles.primaryButton} onClick={onGoShop}>첫 알 고르기</button>
      </section>
    );
  }

  const foodCount = home.inventory["food-sunberry"] ?? 0;
  const acceleratorCount = home.inventory["hatch-hourglass"] ?? 0;
  const requirement = pet.stage === 0 ? pet.hatchRequired : pet.nextEvolutionXp ?? Math.max(1, pet.experience);
  const current = pet.stage === 0 ? pet.hatchProgress : pet.experience;

  return (
    <section className={styles.frontGrid}>
      <div className={`${styles.habitat} ${backgroundClass(pet.backgroundKey)}`}>
        <div className={styles.habitatGlow} />
        <WanderingPet pet={pet} lineage={lineage} actionId={actionId} />
        <div className={styles.habitatLabel}>
          <span>{lineage.elementLabel} 계보</span>
          <strong>{petDisplayName(pet, lineage)}</strong>
        </div>
      </div>

      <aside className={styles.controlPanel}>
        <div className={styles.panelHeading}>
          <div><span>대표 펫</span><h2>{petDisplayName(pet, lineage)}</h2></div>
          <button type="button" className={styles.textButton} onClick={onGoCollection}>수집함 보기</button>
        </div>

        {home.pets.length > 1 && (
          <div className={styles.petChips}>
            {home.pets.map((candidate) => {
              const candidateLineage = getPetLineage(candidate.lineageId);
              if (!candidateLineage) return null;
              return <button type="button" key={candidate.id} className={candidate.id === pet.id ? styles.petChipActive : ""} onClick={() => onSelectPet(candidate.id)}>{candidate.stage === 0 ? "알" : candidateLineage.stages[candidate.stage - 1].name}</button>;
            })}
          </div>
        )}

        <div className={styles.actionSelector}>
          {lineage.behaviorRows.map((row) => (
            <button key={row.id} type="button" disabled={pet.stage === 0} className={actionId === row.id ? styles.actionActive : ""} onClick={() => onActionChange(row.id)}>{row.label}</button>
          ))}
        </div>

        <ProgressBlock pet={pet} lineage={lineage} current={current} required={requirement} />

        <div className={styles.quickActions}>
          {pet.stage === 0 ? (
            <>
              <button type="button" disabled={acceleratorCount < 1 || busyKey !== null} onClick={() => void onAct({ action: "accelerate", petId: pet.id, itemKey: "hatch-hourglass" }, "부화 진행도가 올랐어요.")}>⏳ 가속 {acceleratorCount}</button>
              <button type="button" disabled={foodCount < 1 || busyKey !== null} onClick={() => void onAct({ action: "feed", petId: pet.id, itemKey: "food-sunberry" }, "알이 따뜻해졌어요.")}>🍓 돌보기 {foodCount}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={foodCount < 1 || busyKey !== null} onClick={() => void onAct({ action: "feed", petId: pet.id, itemKey: "food-sunberry" }, "경험치가 올랐어요.")}>🍓 먹이 {foodCount}</button>
              {pet.stage < 3 && <button type="button" className={pet.canEvolve ? styles.evolveButton : ""} disabled={!pet.canEvolve || busyKey !== null} onClick={() => void onAct({ action: "evolve", petId: pet.id }, "새로운 모습으로 진화했어요!")}>✨ 진화</button>}
            </>
          )}
        </div>
      </aside>
    </section>
  );
}

export function CollectionView({ home, selectedPetId, onSelectPet, onAct, busyKey, onGoShop }: {
  home: PetHome;
  selectedPetId: string | null;
  onSelectPet: (value: string) => void;
  onAct: (payload: PetActionPayload, message: string) => Promise<void>;
  busyKey: string | null;
  onGoShop: () => void;
}) {
  if (home.pets.length === 0) {
    return <section className={styles.emptyStage}><div className={styles.emptyEgg}>🪺</div><h2>수집함이 비어 있어요</h2><p>상점에서 첫 알을 골라 주세요.</p><button type="button" className={styles.primaryButton} onClick={onGoShop}>상점으로</button></section>;
  }
  const foodCount = home.inventory["food-sunberry"] ?? 0;
  const acceleratorCount = home.inventory["hatch-hourglass"] ?? 0;
  return (
    <section>
      <div className={styles.sectionHeader}><div><span>MY COLLECTION</span><h2>알과 펫 {home.pets.length}마리</h2></div><p>대표 펫은 프론트와 피팅룸에 먼저 표시돼요.</p></div>
      <div className={styles.collectionGrid}>
        {home.pets.map((pet) => {
          const lineage = getPetLineage(pet.lineageId);
          if (!lineage) return null;
          const current = pet.stage === 0 ? pet.hatchProgress : pet.experience;
          const required = pet.stage === 0 ? pet.hatchRequired : pet.nextEvolutionXp ?? Math.max(1, pet.experience);
          return (
            <article key={pet.id} className={`${styles.petCard} ${pet.id === selectedPetId ? styles.petCardSelected : ""}`}>
              <button type="button" className={styles.petCardPreview} onClick={() => onSelectPet(pet.id)} aria-label={`${petDisplayName(pet, lineage)} 선택`}>
                <PetSprite pet={pet} lineage={lineage} actionId="idle" size={168} />
                {pet.equipped && <span className={styles.equippedBadge}>대표</span>}
              </button>
              <div className={styles.petCardBody}>
                <span className={styles.elementPill}>{lineage.elementLabel}</span>
                <h3>{petDisplayName(pet, lineage)}</h3>
                <p>{pet.stage === 0 ? "부화를 기다리는 중" : `${pet.stage}단계 · 경험치 ${pet.experience}`}</p>
                <MiniMeter current={current} required={required} />
                <div className={styles.cardActions}>
                  {!pet.equipped && <button type="button" disabled={busyKey !== null} onClick={() => void onAct({ action: "equip", petId: pet.id }, "대표 펫으로 정했어요.")}>대표로</button>}
                  {pet.stage === 0 && <button type="button" disabled={acceleratorCount < 1 || busyKey !== null} onClick={() => void onAct({ action: "accelerate", petId: pet.id, itemKey: "hatch-hourglass" }, "부화 진행도가 올랐어요.")}>가속 {acceleratorCount}</button>}
                  <button type="button" disabled={foodCount < 1 || busyKey !== null} onClick={() => void onAct({ action: "feed", petId: pet.id, itemKey: "food-sunberry" }, pet.stage === 0 ? "알이 따뜻해졌어요." : "경험치가 올랐어요.")}>{pet.stage === 0 ? "돌보기" : "먹이"} {foodCount}</button>
                  {pet.stage > 0 && pet.stage < 3 && <button type="button" disabled={!pet.canEvolve || busyKey !== null} className={pet.canEvolve ? styles.evolveButton : ""} onClick={() => void onAct({ action: "evolve", petId: pet.id }, "진화했어요!")}>진화</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ShopView({ home, products, filter, onFilter, onPurchase, busyKey }: {
  home: PetHome;
  products: PetProduct[];
  filter: ShopFilter;
  onFilter: (value: ShopFilter) => void;
  onPurchase: (product: PetProduct) => Promise<void>;
  busyKey: string | null;
}) {
  return (
    <section>
      <div className={styles.sectionHeader}><div><span>ELEMENTAL SHOP</span><h2>알·먹이·배경 효과</h2></div><p>랜덤 알은 저렴하고, 하늘·어둠·빛 지정 알은 프리미엄 가격이에요.</p></div>
      <div className={styles.shopFilters}>
        {(["all", "egg", "care", "background"] as ShopFilter[]).map((value) => <button type="button" key={value} className={filter === value ? styles.shopFilterActive : ""} onClick={() => onFilter(value)}>{value === "all" ? "전체" : value === "egg" ? "알" : value === "care" ? "먹이·가속" : "배경"}</button>)}
      </div>
      <div className={styles.shopGrid}>
        {products.map((product) => {
          const lineage = product.lineageId ? getPetLineage(product.lineageId) : null;
          const owned = productOwned(home, product);
          const insufficient = home.balance < product.price;
          return (
            <article className={styles.productCard} key={product.key}>
              <div className={`${styles.productVisual} ${product.kind === "background" ? backgroundClass(product.itemKey ?? null) : ""}`}>
                {lineage ? <PetSprite pet={{ id: product.key, lineageId: lineage.id, stage: 0, nickname: null, hatchProgress: 0, hatchRequired: lineage.egg.hatchPoints, experience: 0, equipped: false, backgroundKey: null, acquiredVia: "shop", acquiredAt: "", hatchedAt: null, evolvedAt: null, canEvolve: false, nextEvolutionXp: null }} lineage={lineage} actionId="idle" size={138} /> : <span>{product.icon}</span>}
              </div>
              <div className={styles.productBody}>
                <div className={styles.productMeta}><span className={`${styles.rarity} ${styles[`rarity${product.rarity[0].toUpperCase()}${product.rarity.slice(1)}`] ?? ""}`}>{product.rarity}</span><span>{product.kind === "egg" ? "알" : product.kind === "background" ? "배경 효과" : "성장 아이템"}</span></div>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <div className={styles.productFooter}>
                  <strong>{product.price.toLocaleString()} {home.currency.unitLabel}</strong>
                  <button type="button" disabled={owned || insufficient || busyKey !== null} onClick={() => void onPurchase(product)}>{owned ? "보유 중" : insufficient ? "잔액 부족" : busyKey === `buy:${product.key}` ? "구매 중…" : "구매"}</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function FittingView({ home, pet, lineage, nickname, onNickname, onSelectPet, onAct, busyKey }: {
  home: PetHome;
  pet: Pet | null;
  lineage: PetLineageDefinition | null;
  nickname: string;
  onNickname: (value: string) => void;
  onSelectPet: (value: string) => void;
  onAct: (payload: PetActionPayload, message: string) => Promise<void>;
  busyKey: string | null;
}) {
  if (!pet || !lineage) return <section className={styles.emptyStage}><div className={styles.emptyEgg}>🎨</div><h2>꾸밀 펫이 아직 없어요</h2><p>알을 구한 뒤 다시 와 주세요.</p></section>;
  const ownedBackgrounds = PET_BACKGROUND_PRODUCTS.filter((product) => (home.inventory[product.itemKey] ?? 0) > 0);
  return (
    <section className={styles.fittingGrid}>
      <div className={`${styles.fittingStage} ${backgroundClass(pet.backgroundKey)}`}>
        <PetSprite pet={pet} lineage={lineage} actionId={lineage.signature.id} size={300} />
        <div><span>{lineage.elementLabel} · {pet.stage === 0 ? "알" : `${pet.stage}단계`}</span><strong>{petDisplayName(pet, lineage)}</strong></div>
      </div>
      <aside className={styles.fittingPanel}>
        <div className={styles.panelHeading}><div><span>FITTING ROOM</span><h2>대표 펫과 공간 꾸미기</h2></div></div>
        <label className={styles.fieldLabel}>꾸밀 펫<select value={pet.id} onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectPet(event.target.value)}>{home.pets.map((candidate) => { const candidateLineage = getPetLineage(candidate.lineageId); return candidateLineage ? <option key={candidate.id} value={candidate.id}>{petDisplayName(candidate, candidateLineage)}</option> : null; })}</select></label>
        <label className={styles.fieldLabel}>별명<div className={styles.inputRow}><input value={nickname} maxLength={12} placeholder={pet.stage === 0 ? "알의 별명" : lineage.stages[Math.max(0, pet.stage - 1)].name} onChange={(event: ChangeEvent<HTMLInputElement>) => onNickname(event.target.value)} /><button type="button" disabled={busyKey !== null || nickname === (pet.nickname ?? "")} onClick={() => void onAct({ action: "rename", petId: pet.id, nickname }, "별명을 저장했어요.")}>저장</button></div></label>
        <div className={styles.fieldLabel}>배경 효과<div className={styles.backgroundOptions}><button type="button" className={!pet.backgroundKey ? styles.backgroundOptionActive : ""} onClick={() => void onAct({ action: "set-background", petId: pet.id, itemKey: null }, "기본 배경을 적용했어요.")}><span className={styles.backgroundDefault} />기본</button>{ownedBackgrounds.map((product) => <button type="button" key={product.key} className={pet.backgroundKey === product.itemKey ? styles.backgroundOptionActive : ""} onClick={() => void onAct({ action: "set-background", petId: pet.id, itemKey: product.itemKey }, `${product.name} 효과를 적용했어요.`)}><span className={backgroundClass(product.itemKey)} />{product.name}</button>)}</div></div>
        {!pet.equipped && <button type="button" className={styles.primaryButton} disabled={busyKey !== null} onClick={() => void onAct({ action: "equip", petId: pet.id }, "대표 펫으로 정했어요.")}>이 펫을 대표로 설정</button>}
        {ownedBackgrounds.length === 0 && <p className={styles.mutedNote}>상점에서 배경 효과를 구하면 여기에 표시돼요.</p>}
      </aside>
    </section>
  );
}

export function DexView({ home }: { home: PetHome }) {
  const discoveredCount = home.dex.reduce((sum, entry) => sum + entry.discoveredStages.length, 0);
  return (
    <section>
      <div className={styles.sectionHeader}><div><span>ELEMENTAL DEX</span><h2>원소 도감 {discoveredCount}/21</h2></div><p>한 번이라도 부화·진화한 단계가 도감에 기록돼요.</p></div>
      <div className={styles.dexGrid}>
        {PET_LINEAGES.map((lineage) => {
          const entry = home.dex.find((candidate) => candidate.lineageId === lineage.id);
          return (
            <article className={styles.dexCard} key={lineage.id}>
              <header><span>{lineage.elementLabel}</span><strong>{lineage.stages[0].name} 계보</strong><small>{entry?.discoveredStages.length ?? 0}/3</small></header>
              <div className={styles.dexStages}>
                {lineage.stages.map((stage) => {
                  const discovered = entry?.discoveredStages.includes(stage.stage) ?? false;
                  const fauxPet: Pet = { id: `${lineage.id}-${stage.stage}`, lineageId: lineage.id, stage: stage.stage, nickname: null, hatchProgress: lineage.egg.hatchPoints, hatchRequired: lineage.egg.hatchPoints, experience: 0, equipped: false, backgroundKey: null, acquiredVia: "dex", acquiredAt: "", hatchedAt: null, evolvedAt: null, canEvolve: false, nextEvolutionXp: null };
                  return <div key={stage.id} className={discovered ? styles.dexDiscovered : styles.dexLocked}><PetSprite pet={fauxPet} lineage={lineage} actionId="idle" size={116} /><strong>{discovered ? stage.name : "???"}</strong><span>{stage.stage}단계</span></div>;
                })}
              </div>
              {!entry?.eggOwned && <p>이 계보의 알을 아직 만나지 못했어요.</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
