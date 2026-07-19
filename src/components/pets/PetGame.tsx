"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { PetHomePayload, PetSpeciesPayload } from "@/lib/pets/types";
import { PetSprite } from "./PetSprite";

type Tab = "incubator" | "synergy" | "dex";
type OwnedPet = PetHomePayload["pets"][number];
type EggTiming = {
  eggId: string;
  receivedAtMs: number;
  remainingSeconds: number;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "incubator", label: "부화장" },
  { id: "synergy", label: "시너지" },
  { id: "dex", label: "도감" },
];

const effectLabels: Record<string, string> = {
  hatch_speed: "부화 속도",
  evolution_xp: "진화 경험치",
  reading_currency: "독서 보상",
  walking_currency: "걷기 보상",
};

const typeLabels: Record<string, string> = {
  flame: "불꽃",
  nature: "자연",
  wisdom: "지혜",
  energy: "활력",
};

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요해요.",
  EGG_ALREADY_ACTIVE: "이미 부화 중인 알이 있어요.",
  EGG_NOT_READY: "아직 알이 부화할 시간이 아니에요.",
  INSUFFICIENT_FUNDS: "잔액이 부족해요.",
  INSUFFICIENT_CURRENCY: "잔액이 부족해요.",
  INSUFFICIENT_SHARDS: "조각이 부족해요.",
  PET_NOT_FOUND: "펫을 찾지 못했어요.",
  EGG_NOT_FOUND: "알을 찾지 못했어요.",
  LOADOUT_LIMIT: "시너지에는 펫을 5마리까지 넣을 수 있어요.",
  INVALID_LOADOUT: "선택한 펫 구성을 저장할 수 없어요.",
  CANNOT_ENHANCE: "아직 이 펫을 강화할 수 없어요.",
  CANNOT_EVOLVE: "아직 이 펫을 진화시킬 수 없어요.",
  unauthorized: "로그인이 필요해요.",
  invalid_json: "요청 내용을 다시 확인해 주세요.",
  invalid_egg_type: "선택한 알을 찾지 못했어요.",
  active_egg_exists: "이미 부화 중인 알이 있어요.",
  insufficient_balance: "잔액이 부족해요.",
  egg_not_found: "알을 찾지 못했어요.",
  egg_forbidden: "이 알을 부화할 수 없어요.",
  egg_already_hatched: "이미 부화한 알이에요.",
  egg_not_ready: "아직 알이 부화할 시간이 아니에요.",
  invalid_pet_ids: "선택한 펫 구성을 저장할 수 없어요.",
  pet_not_found: "펫을 찾지 못했어요.",
  pet_forbidden: "이 펫을 선택할 수 없어요.",
  enhancement_max: "이미 최대 강화 단계예요.",
  insufficient_shards: "조각이 부족해요.",
  pet_changed: "펫 정보가 바뀌었어요. 다시 시도해 주세요.",
  no_next_evolution: "이 펫은 더 진화하지 않아요.",
  evolution_requirements_not_met: "강화 단계와 진화 XP가 아직 부족해요.",
  internal: "잠시 문제가 생겼어요. 다시 시도해 주세요.",
};

export function PetGame() {
  const [home, setHome] = useState<PetHomePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("incubator");
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const [eggTiming, setEggTiming] = useState<EggTiming | null>(null);

  const applyHome = useCallback((next: PetHomePayload) => {
    setHome(next);
    setEggTiming(next.egg ? {
      eggId: next.egg.id,
      receivedAtMs: performance.now(),
      remainingSeconds: next.egg.remainingSeconds,
    } : null);
    setDraftIds(Array.from(new Set(next.loadoutPetIds)).slice(0, 5));
    setTargetSlot(null);
    setActionError(null);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/student/pets", { signal, cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body));
      applyHome(body as PetHomePayload);
      setStatus("ready");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "펫 정보를 불러오지 못했어요.");
      setStatus("error");
    }
  }, [applyHome]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setClock(performance.now());
    const timer = window.setInterval(() => setClock(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function mutate(path: string, method: "POST" | "PATCH", body?: unknown) {
    setBusy(path);
    setActionError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(payload));
      if (!payload.home) throw new Error("서버 응답을 확인하지 못했어요. 다시 시도해 주세요.");
      applyHome(payload.home as PetHomePayload);
      return payload.home as PetHomePayload;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "요청을 처리하지 못했어요. 다시 시도해 주세요.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (status === "loading") {
    return (
      <main className="pet-page pet-state" aria-busy="true">
        <span className="pet-loader" aria-hidden="true" />
        <p>펫 마을을 불러오는 중…</p>
      </main>
    );
  }

  if (status === "error" || !home) {
    return (
      <main className="pet-page pet-state">
        <h1>펫 마을에 연결하지 못했어요</h1>
        <p role="alert">{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button className="pet-button is-primary" type="button" onClick={() => void load()}>
          다시 시도
        </button>
      </main>
    );
  }

  const selectedPet = home.pets.find((pet) => pet.id === selectedPetId) ?? null;
  const hasDraftChanges = !sameIds(draftIds, home.loadoutPetIds);
  const remaining = getEggRemaining(home, eggTiming, clock);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((item) => item.id === current);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(currentIndex + direction + tabs.length) % tabs.length].id;
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(`pet-tab-${next}`)?.focus());
  }

  function choosePet(petId: string) {
    setActionError(null);
    const existingIndex = draftIds.indexOf(petId);
    if (existingIndex >= 0) {
      setDraftIds(draftIds.filter((id) => id !== petId));
      if (targetSlot === existingIndex) setTargetSlot(null);
      return;
    }
    if (targetSlot !== null) {
      const next = [...draftIds];
      if (targetSlot < next.length) next[targetSlot] = petId;
      else next.push(petId);
      setDraftIds(Array.from(new Set(next)).slice(0, 5));
      setTargetSlot(null);
      return;
    }
    if (draftIds.length < 5) {
      setDraftIds([...draftIds, petId]);
      return;
    }
    setActionError("바꿀 슬롯을 먼저 선택해 주세요.");
  }

  async function upgrade(pet: OwnedPet, action: "enhance" | "evolve") {
    const next = await mutate(`/api/student/pets/${pet.id}/${action}`, "POST");
    if (!next) return;
    const replacement = next.pets
      .filter((candidate) => candidate.species.familyKey === pet.species.familyKey)
      .sort((a, b) => b.species.stage - a.species.stage)[0];
    setSelectedPetId(replacement?.id ?? null);
  }

  return (
    <main className="pet-page">
      <header className="pet-page-head">
        <h1>펫 마을</h1>
        <div className="pet-balance" aria-label={`보유 잔액 ${home.currency.balance.toLocaleString()} ${home.currency.unitLabel}`}>
          <span>보유</span>
          <strong>{home.currency.balance.toLocaleString()}</strong>
          <span>{home.currency.unitLabel}</span>
        </div>
      </header>

      <div className="pet-tabs" role="tablist" aria-label="펫 메뉴">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`pet-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`pet-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => handleTabKeyDown(event, item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {actionError ? <div className="pet-alert" role="alert">{actionError}</div> : null}

      {tab === "incubator" ? (
        <section id="pet-panel-incubator" className="pet-tab-panel" role="tabpanel" aria-labelledby="pet-tab-incubator">
          <div className="pet-incubator-layout">
            <section className="pet-incubator" aria-labelledby="incubator-title">
              <div className="pet-section-head">
                <h2 id="incubator-title">부화장</h2>
                <span className="pet-effect-chip">속도 {formatBps(home.effects.hatchSpeedBps)}</span>
              </div>
              {home.egg ? (
                <div className="pet-active-egg">
                  <img src="/game-ui/incubator-egg.webp" alt={`${home.egg.eggName}이 부화기 안에서 자라고 있어요`} />
                  <div className="pet-egg-info">
                    <strong>{home.egg.eggName}</strong>
                    <span>기본 {formatDuration(home.egg.baseHatchSeconds)}</span>
                    <div className="pet-progress" aria-label={`부화 진행률 ${getEggPercent(home, eggTiming, clock)}%`}>
                      <span style={{ width: `${getEggPercent(home, eggTiming, clock)}%` }} />
                    </div>
                    <b aria-live="polite">{remaining <= 0 ? "부화 준비 완료!" : `${formatClock(remaining)} 남음`}</b>
                    {remaining <= 0 ? (
                      <button
                        className="pet-button is-primary"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void mutate(`/api/student/pets/eggs/${home.egg?.id}/hatch`, "POST")}
                      >
                        {busy?.includes("/hatch") ? "부화 중…" : "부화"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="pet-egg-shop">
                  <div className="pet-empty-copy">
                    <img src="/game-ui/empty-nest.webp" alt="" aria-hidden="true" />
                  </div>
                  <div className="pet-shop-list">
                    {home.eggShop.map((egg) => {
                      const affordable = home.currency.balance >= egg.price;
                      return (
                        <article key={egg.eggType} className="pet-shop-row">
                          <div><strong>{egg.name}</strong><span>{formatDuration(egg.baseHatchSeconds)}</span></div>
                          <div><b>{egg.price.toLocaleString()} {home.currency.unitLabel}</b>
                            <button
                              className="pet-button is-secondary"
                              type="button"
                              disabled={busy !== null || !affordable}
                              onClick={() => void mutate("/api/student/pets/eggs", "POST", { eggType: egg.eggType })}
                            >{busy === "/api/student/pets/eggs" ? "구매 중…" : affordable ? "구매" : "잔액 부족"}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
            <BuffSummary home={home} />
          </div>
        </section>
      ) : null}

      {tab === "synergy" ? (
        <section id="pet-panel-synergy" className="pet-tab-panel" role="tabpanel" aria-labelledby="pet-tab-synergy">
          <div className="pet-section-head">
            <h2>시너지 팀</h2>
            <button
              className="pet-button is-primary"
              type="button"
              disabled={busy !== null || !hasDraftChanges}
              onClick={() => void mutate("/api/student/pets/loadout", "PATCH", { petIds: Array.from(new Set(draftIds)).slice(0, 5) })}
            >{busy === "/api/student/pets/loadout" ? "저장 중…" : "저장"}</button>
          </div>
          <div className="pet-slot-row" aria-label="시너지 펫 슬롯 5개">
            {Array.from({ length: 5 }, (_, index) => {
              const pet = home.pets.find((item) => item.id === draftIds[index]);
              return (
                <div key={index} className={`pet-slot${targetSlot === index ? " is-target" : ""}`}>
                  <button type="button" className="pet-slot-target" aria-pressed={targetSlot === index} onClick={() => setTargetSlot(targetSlot === index ? null : index)}>
                    <span>{index + 1}</span>
                    {pet ? <><PetSprite spriteKey={pet.species.spriteKey} name={pet.species.name} size="small" /><strong>{pet.species.name}</strong></> : <b>빈 슬롯</b>}
                  </button>
                  {pet ? <button className="pet-slot-remove" type="button" aria-label={`${pet.species.name} 슬롯에서 빼기`} onClick={() => setDraftIds(draftIds.filter((id) => id !== pet.id))}>빼기</button> : null}
                </div>
              );
            })}
          </div>
          <div className="pet-owned-grid">
            {home.pets.length === 0 ? <p className="pet-empty-line">보유 펫 없음</p> : home.pets.map((pet) => {
              const included = draftIds.includes(pet.id);
              return (
                <button key={pet.id} type="button" className={`pet-owned-card${included ? " is-selected" : ""}`} aria-pressed={included} onClick={() => choosePet(pet.id)}>
                  <PetSprite spriteKey={pet.species.spriteKey} name={pet.species.name} />
                  <span className="pet-owned-main"><strong>{pet.species.name}</strong><span>{typeName(pet.species)} · {pet.species.stage + 1}단계 · +{pet.enhancementLevel}</span></span>
                  <span className="pet-owned-effect">{effectLabels[pet.species.effectKey] ?? pet.species.effectKey}<b>{formatBps(pet.effectiveBuffBps)}</b></span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "dex" ? (
        <section id="pet-panel-dex" className="pet-tab-panel" role="tabpanel" aria-labelledby="pet-tab-dex">
          <div className="pet-section-head"><h2>펫 도감</h2><span className="pet-count">{home.dex.filter((item) => item.discovered).length} / {home.dex.length}</span></div>
          <div className="pet-dex-grid">
            {home.dex.map((entry) => {
              const owned = entry.ownedPetId ? home.pets.find((pet) => pet.id === entry.ownedPetId) : null;
              return (
                <button key={entry.species.id} type="button" className={`pet-dex-card${entry.discovered ? "" : " is-locked"}`} disabled={!owned} onClick={() => owned && setSelectedPetId(owned.id)}>
                  <PetSprite spriteKey={entry.species.spriteKey} name={entry.species.name} locked={!entry.discovered} />
                  <strong>{entry.discovered ? entry.species.name : "???"}</strong>
                  <span>{entry.discovered ? `${typeName(entry.species)} · ${entry.species.stage + 1}단계` : "미발견"}</span>
                </button>
              );
            })}
          </div>
          {selectedPet ? <PetDetail pet={selectedPet} unit={home.currency.unitLabel} busy={busy !== null} onClose={() => setSelectedPetId(null)} onEnhance={() => void upgrade(selectedPet, "enhance")} onEvolve={() => void upgrade(selectedPet, "evolve")} /> : null}
        </section>
      ) : null}
    </main>
  );
}

function BuffSummary({ home }: { home: PetHomePayload }) {
  const summaries = [
    ["부화 속도", home.effects.hatchSpeedBps],
    ["진화 경험치", home.effects.evolutionXpBps],
    ["독서 보상", home.effects.readingRewardBps],
    ["걷기 보상", home.effects.walkingRewardBps],
  ] as const;
  return (
    <aside className="pet-buff-panel" aria-labelledby="buff-title">
      <div className="pet-section-head"><h2 id="buff-title">버프 현황</h2></div>
      <div className="pet-buff-grid">{summaries.map(([label, bps]) => <div key={label}><span>{label}</span><strong>{formatBps(bps)}</strong></div>)}</div>
      <div className="pet-breakdown">
        {home.effects.breakdown.length ? home.effects.breakdown.map((item, index) => <div key={`${item.effectKey}-${item.label}-${index}`}><span>{item.label}</span><b>{formatBps(item.bps)}</b></div>) : <p>활성 효과 없음</p>}
      </div>
    </aside>
  );
}

function PetDetail({ pet, unit, busy, onClose, onEnhance, onEvolve }: { pet: OwnedPet; unit: string; busy: boolean; onClose: () => void; onEnhance: () => void; onEvolve: () => void }) {
  const requiredXp = pet.evolutionXpRequired ?? 0;
  return (
    <section className="pet-detail" aria-labelledby="pet-detail-title">
      <button className="pet-detail-close" type="button" onClick={onClose} aria-label="펫 상세 닫기">×</button>
      <PetSprite spriteKey={pet.species.spriteKey} name={pet.species.name} size="large" />
      <div className="pet-detail-body">
        <div><span>{typeName(pet.species)} · {pet.species.stage + 1}단계</span><h3 id="pet-detail-title">{pet.species.name} <small>+{pet.enhancementLevel}</small></h3></div>
        <dl><div><dt>효과</dt><dd>{effectLabels[pet.species.effectKey]} {formatBps(pet.effectiveBuffBps)}</dd></div><div><dt>조각</dt><dd>{pet.shards}개</dd></div><div><dt>진화 XP</dt><dd>{pet.evolutionXp} / {requiredXp || "—"}</dd></div></dl>
        <div className="pet-detail-actions">
          <button className="pet-button is-secondary" type="button" disabled={busy || !pet.canEnhance} onClick={onEnhance}>강화</button>
          <button className="pet-button is-primary" type="button" disabled={busy || !pet.canEvolve} onClick={onEvolve}>진화</button>
        </div>
        {pet.enhanceCost ? <p className="pet-cost-note">강화: 조각 {pet.enhanceCost.shards}개 · {pet.enhanceCost.currency.toLocaleString()} {unit}</p> : <p className="pet-cost-note">최대 강화</p>}
        {!pet.canEvolve && pet.nextEvolution ? <p className="pet-cost-note">진화: 강화 +10 · XP {Math.max(0, requiredXp - pet.evolutionXp)} 더 필요</p> : null}
      </div>
    </section>
  );
}

function readError(body: unknown): string {
  if (!body || typeof body !== "object") return "요청을 처리하지 못했어요. 다시 시도해 주세요.";
  const value = body as { code?: unknown; error?: unknown };
  const code = typeof value.code === "string" ? value.code : typeof value.error === "string" ? value.error : "";
  return errorMessages[code] ?? (code && code.length < 80 && /[가-힣]/.test(code) ? code : "요청을 처리하지 못했어요. 다시 시도해 주세요.");
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function typeName(species: PetSpeciesPayload) {
  return typeLabels[species.type] ?? species.type;
}

function formatBps(bps: number) {
  const percent = bps / 100;
  return `${bps >= 0 ? "+" : ""}${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2).replace(/0+$/, "")}%`;
}

function getEggRemaining(home: PetHomePayload, timing: EggTiming | null, now: number) {
  if (!home.egg || !timing || timing.eggId !== home.egg.id) return home.egg?.remainingSeconds ?? 0;
  const elapsed = Math.max(0, (now - timing.receivedAtMs) / 1000);
  return Math.max(0, Math.ceil(timing.remainingSeconds - elapsed));
}

function getEggPercent(home: PetHomePayload, timing: EggTiming | null, now: number) {
  if (!home.egg || home.egg.baseHatchSeconds <= 0) return 100;
  const speed = 1 + home.effects.hatchSpeedBps / 10000;
  const remainingProgress = getEggRemaining(home, timing, now) * speed;
  return Math.min(100, Math.max(0, Math.round(((home.egg.baseHatchSeconds - remainingProgress) / home.egg.baseHatchSeconds) * 100)));
}

function formatDuration(seconds: number) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}시간`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}분`;
  return `${seconds}초`;
}

function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}
