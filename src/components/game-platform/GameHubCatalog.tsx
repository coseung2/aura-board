"use client";

import Image, { type StaticImageData } from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, CirclePlay, Radio, Trophy } from "lucide-react";
import { useState } from "react";
import type { OfficialGameKind } from "@/lib/game-platform/contracts";
import {
  GAME_HUB_ORDER,
  OFFICIAL_GAME_CATALOG,
} from "@/lib/game-platform/catalog";
import kordleArtwork from "../../../.ai-bridge/generated-game-hub-assets/kordle.png";
import omokArtwork from "../../../.ai-bridge/generated-game-hub-assets/omok.png";
import shadowAllianceArtwork from "../../../.ai-bridge/generated-game-hub-assets/shadow-alliance.png";
import songGuessArtwork from "../../../.ai-bridge/generated-game-hub-assets/song-guess.png";
import speedGameArtwork from "../../../.ai-bridge/generated-game-hub-assets/speed-game.png";
import styles from "./game-hub.module.css";

type EntryResponse = {
  gameKind: OfficialGameKind;
  boardId: string;
  boardSlug: string;
  href: string;
};

const ARTWORK: Record<OfficialGameKind, StaticImageData> = {
  kordle: kordleArtwork,
  "speed-game": speedGameArtwork,
  "shadow-alliance": shadowAllianceArtwork,
  omok: omokArtwork,
  "song-guess": songGuessArtwork,
};

export function GameHubCatalog() {
  const router = useRouter();
  const [pendingKind, setPendingKind] = useState<OfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<OfficialGameKind, string>>
  >({});

  async function enterGame(gameKind: OfficialGameKind) {
    if (pendingKind) return;
    setPendingKind(gameKind);
    setErrors((current) => ({ ...current, [gameKind]: undefined }));
    try {
      const response = await fetch("/api/student/game-hub/entry", {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ gameKind }),
      });
      const body = (await response.json().catch(() => null)) as EntryResponse | null;
      if (!response.ok || !body?.href || body.gameKind !== gameKind) {
        throw new Error("game_hub_entry_failed");
      }
      router.push(body.href);
    } catch {
      setErrors((current) => ({
        ...current,
        [gameKind]: "게임 방을 열지 못했어요. 잠시 후 다시 시도해 주세요.",
      }));
      setPendingKind(null);
    }
  }

  return (
    <section className={styles.hub} aria-labelledby="game-hub-title">
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <p className={styles.eyebrow}>Game hub</p>
          <h2 className={styles.title} id="game-hub-title">
            바로 입장하는 게임
          </h2>
          <p className={styles.intro}>
            선생님이 별도 보드를 만들지 않아도 다섯 게임을 항상 확인하고 입장할
            수 있어요. 진행에 필요한 문제나 참가자는 게임 안에서 안전하게
            안내합니다.
          </p>
        </div>
        <a
          className={styles.recordsLink}
          href="/student/boards?category=play&playTab=records"
        >
          <Trophy aria-hidden size={18} strokeWidth={2} />
          나의 전적
        </a>
      </header>

      <div className={styles.grid}>
        {GAME_HUB_ORDER.map((kind, index) => {
          const game = OFFICIAL_GAME_CATALOG[kind];
          const pending = pendingKind === kind;
          const error = errors[kind];
          return (
            <article className={styles.card} key={kind}>
              <div className={styles.artwork}>
                <Image
                  className={styles.artworkImage}
                  src={ARTWORK[kind]}
                  alt={`${game.label} 게임 대표 아트`}
                  fill
                  priority={index < 2}
                  sizes="(max-width: 680px) 100vw, (max-width: 1159px) 50vw, 33vw"
                />
              </div>
              <div className={styles.body}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{game.label}</h3>
                  <span className={styles.status}>
                    <Radio aria-hidden size={14} strokeWidth={2.4} />
                    {game.statusLabel}
                  </span>
                </div>
                <p className={styles.description}>{game.description}</p>
                <button
                  type="button"
                  className={styles.entryButton}
                  disabled={pendingKind !== null}
                  aria-describedby={error ? `game-hub-error-${kind}` : undefined}
                  onClick={() => void enterGame(kind)}
                >
                  <CirclePlay aria-hidden size={19} strokeWidth={2.3} />
                  {pending ? "게임 방 여는 중…" : "입장하기"}
                </button>
                {error ? (
                  <p
                    className={styles.error}
                    id={`game-hub-error-${kind}`}
                    role="alert"
                  >
                    <AlertCircle aria-hidden size={17} strokeWidth={2.2} />
                    {error}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
