"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { PetLineageDefinition } from "@/lib/pets/catalog";
import { getPetAtlasDataUrl } from "@/lib/pets/atlas";
import { progressPercent } from "@/lib/pets/progression";
import { petDisplayName, type Pet } from "./model";
import styles from "./PetSanctuary.module.css";

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

export function ProgressBlock({ pet, lineage, current, required }: { pet: Pet; lineage: PetLineageDefinition; current: number; required: number }) {
  const percentage = progressPercent(current, required);
  return <div className={styles.progressBlock}><div><span>{pet.stage === 0 ? "부화 진행" : pet.stage === 3 ? "최종 진화" : `다음 진화: ${lineage.stages[pet.stage]?.name}`}</span><strong>{pet.stage === 3 ? `${pet.experience} XP` : `${current}/${required}`}</strong></div><div className={styles.progressTrack}><span style={{ width: `${pet.stage === 3 ? 100 : percentage}%` }} /></div></div>;
}

export function MiniMeter({ current, required }: { current: number; required: number }) {
  return <div className={styles.miniMeter}><span style={{ width: `${progressPercent(current, required)}%` }} /></div>;
}

export function PetSprite({ pet, lineage, actionId, size }: { pet: Pet; lineage: PetLineageDefinition; actionId: string; size: number }) {
  const [frame, setFrame] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    setFrame(0);
    if (reducedMotion) return;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % 3), pet.stage === 0 ? 620 : 360);
    return () => window.clearInterval(timer);
  }, [pet.stage, actionId, lineage.id, reducedMotion]);
  const actionIndex = Math.max(0, lineage.behaviorRows.findIndex((row) => row.id === actionId));
  const row = pet.stage === 0 ? lineage.atlas.eggRow : lineage.atlas.stageRowStarts[pet.stage - 1] + actionIndex;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${getPetAtlasDataUrl(lineage)})`,
    backgroundSize: `${lineage.atlas.columns * 100}% ${lineage.atlas.rows * 100}%`,
    backgroundPosition: `${frame * 50}% ${(row / (lineage.atlas.rows - 1)) * 100}%`,
  };
  return <div className={styles.sprite} style={style} role="img" aria-label={petDisplayName(pet, lineage)} />;
}

export function WanderingPet({ pet, lineage, actionId }: { pet: Pet; lineage: PetLineageDefinition; actionId: string }) {
  const [position, setPosition] = useState({ x: 0, y: 0, flip: 1 });
  const reducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    setPosition({ x: 0, y: 0, flip: 1 });
    if (reducedMotion) return;
    const move = () => setPosition((current) => {
      const nextX = Math.round((Math.random() - 0.5) * 280);
      const nextY = Math.round(Math.random() * 26);
      return { x: nextX, y: nextY, flip: nextX < current.x ? -1 : 1 };
    });
    const timer = window.setInterval(move, 2800);
    return () => window.clearInterval(timer);
  }, [pet.id, reducedMotion]);
  return <div className={styles.wanderer} style={{ transform: `translate(${position.x}px, ${position.y}px) scaleX(${position.flip})` }}><PetSprite pet={pet} lineage={lineage} actionId={actionId} size={300} /></div>;
}
