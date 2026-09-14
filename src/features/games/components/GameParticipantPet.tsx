"use client";

import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { UserRound } from "lucide-react";
import { getSlimeDefinition, getSlimeShopItem } from "@/lib/pets/catalog";
import { participantPetItemKeys } from "@/lib/pets/participant-pet-items";
import type { SlimeShopItem } from "@/lib/pets/types";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import { fitParticipantPet, type ParticipantPetSize } from "@/lib/pets/participant-pet-geometry";
import styles from "./GameParticipantPet.module.css";

export type GameParticipantPetData = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedItemKeys: string[];
  hiddenItemKeys: string[];
};

/**
 * Waiting-room avatar for a student's representative pet.
 *
 * Shows the student's visible equipment and vehicle as one contained scene.
 * Backgrounds and floors are omitted; renderer canvas and holder are separate.
 */
export const GameParticipantPet = memo(function GameParticipantPet({
  name,
  pet,
  size = 56,
  className = "",
}: {
  name: string;
  pet: GameParticipantPetData | null | undefined;
  size?: ParticipantPetSize;
  className?: string;
}) {
  const holderRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<ReturnType<typeof fitParticipantPet>>(null);
  const slime = pet?.color ? getSlimeDefinition(pet.color) : undefined;
  const items = pet
    ? participantPetItemKeys(pet.equippedItemKeys, pet.hiddenItemKeys)
        .map((key) => getSlimeShopItem(key))
        .filter((item): item is SlimeShopItem => Boolean(item))
    : [];

  useLayoutEffect(() => {
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    if (!holder || !canvas) return;
    const measure = () => {
      const next = fitParticipantPet(holder.clientWidth, holder.clientHeight, canvas.offsetWidth, canvas.offsetHeight);
      setFit((current) => current?.scale === next?.scale && current?.width === next?.width && current?.height === next?.height ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(holder);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [slime, pet, size]);

  return (
    <span
      ref={holderRef}
      className={`${styles.holder} ${className}`.trim()}
      style={{ "--game-pet-default-size": `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${name} ${slime ? "대표펫" : "대표펫 미지정"}`}
    >
      {slime ? (
        <span ref={canvasRef} className={styles.canvas} aria-hidden="true"
          style={{ visibility: fit ? "visible" : "hidden", transform: `translate(-50%, -50%) scale(${fit?.scale ?? 1})` }}>
          <SlimeCharacterSprite
            slime={slime}
            items={items}
            growthStage={pet?.growthStage}
            scale={1}
            hostBackground={false}
            containEquipment
          />
        </span>
      ) : <UserRound className={styles.fallback} aria-hidden="true" />}
    </span>
  );
});
