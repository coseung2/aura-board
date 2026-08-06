"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, CirclePlay, Radio, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { OfficialGameKind } from "@/lib/game-platform/contracts";
import {
  GAME_HUB_ORDER,
  OFFICIAL_GAME_CATALOG,
} from "@/lib/game-platform/catalog";
import styles from "./game-hub.module.css";

type EntryResponse = {
  gameKind: OfficialGameKind;
  boardId: string;
  boardSlug: string;
  href: string;
};

const ARTWORK: Record<OfficialGameKind, string> = {
  kordle: "/game-hub/kordle.png",
  "speed-game": "/game-hub/speed-game.png",
  "shadow-alliance": "/game-hub/shadow-alliance.png",
  omok: "/game-hub/omok.png",
  "song-guess": "/game-hub/song-guess.png",
};

export function GameHubCatalog() {
  const router = useRouter();
  const [pendingKind, setPendingKind] = useState<OfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<OfficialGameKind, string>>
  >({});

  useEffect(() => {
    setPendingKind(null);
  }, []);

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
        [gameKind]: "입장에 실패했어요.",
      }));
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <section className={styles.hub} aria-labelledby="game-hub-title">
      <header className={styles.heading}>
        <h2 className={styles.title} id="game-hub-title">
          게임
        </h2>
        <a
          className={styles.recordsLink}
          href="/student/boards?category=play&playTab=records"
        >
          <Trophy aria-hidden size={18} strokeWidth={2} />
          나의 전적
        </a>
      </header>

      <article className={styles.liveFeature}>
        <div className={styles.liveFeatureCopy}>
          <span className={styles.liveFeatureBadge}>
            <Radio aria-hidden size={15} strokeWidth={2.5} />
            LIVE
          </span>
          <div>
            <p>매일 오후 1:30 · 전체 이용자</p>
            <h3>오늘의 라이브 퀴즈</h3>
            <span>진행자 없이 모두가 같은 문제를 푸는 실시간 4지선다</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.liveFeatureButton}
          onClick={() => router.push("/student/live-quiz")}
        >
          <CirclePlay aria-hidden size={20} strokeWidth={2.3} />
          라이브 입장
        </button>
      </article>

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
                  sizes="(max-width: 420px) 100vw, (max-width: 640px) 50vw, (max-width: 900px) 33vw, 20vw"
                />
              </div>
              <div className={styles.body}>
                <h3 className={styles.cardTitle}>{game.label}</h3>
                <button
                  type="button"
                  className={styles.entryButton}
                  disabled={pendingKind !== null}
                  aria-describedby={error ? `game-hub-error-${kind}` : undefined}
                  onClick={() => void enterGame(kind)}
                >
                  <CirclePlay aria-hidden size={19} strokeWidth={2.3} />
                  {pending ? "여는 중" : "입장"}
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
