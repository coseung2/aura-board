"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CirclePlay,
  Radio,
  School,
  Trophy,
} from "lucide-react";
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

type TeacherClassroom = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  viewer?: "student" | "teacher";
  classrooms?: TeacherClassroom[];
};

const ARTWORK: Record<OfficialGameKind, string> = {
  kordle: "/game-hub/kordle.png",
  "speed-game": "/game-hub/speed-game.png",
  "shadow-alliance": "/game-hub/shadow-alliance.png",
  omok: "/game-hub/omok.png",
  "song-guess": "/game-hub/song-guess.png",
};

export function GameHubCatalog({
  viewer = "student",
  classrooms = [],
}: Props) {
  const router = useRouter();
  const teacherMode = viewer === "teacher";
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    () => classrooms[0]?.id ?? "",
  );
  const [pendingKind, setPendingKind] = useState<OfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<OfficialGameKind, string>>
  >({});

  useEffect(() => {
    setPendingKind(null);
  }, []);

  useEffect(() => {
    if (!teacherMode) return;
    if (classrooms.some((classroom) => classroom.id === selectedClassroomId)) {
      return;
    }
    setSelectedClassroomId(classrooms[0]?.id ?? "");
  }, [classrooms, selectedClassroomId, teacherMode]);

  const selectedClassroom = classrooms.find(
    (classroom) => classroom.id === selectedClassroomId,
  );
  const gameEntryDisabled = teacherMode && !selectedClassroom;

  async function enterGame(gameKind: OfficialGameKind) {
    if (pendingKind || gameEntryDisabled) return;
    setPendingKind(gameKind);
    setErrors((current) => ({ ...current, [gameKind]: undefined }));
    try {
      const response = await fetch(
        teacherMode
          ? "/api/teacher/game-hub/entry"
          : "/api/student/game-hub/entry",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(
            teacherMode
              ? { gameKind, classroomId: selectedClassroomId }
              : { gameKind },
          ),
        },
      );
      const body = (await response.json().catch(() => null)) as EntryResponse | null;
      if (!response.ok || !body?.href || body.gameKind !== gameKind) {
        throw new Error("game_hub_entry_failed");
      }
      router.push(body.href);
    } catch {
      setErrors((current) => ({
        ...current,
        [gameKind]: teacherMode
          ? "게임방을 열지 못했어요."
          : "입장에 실패했어요.",
      }));
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <section className={styles.hub} aria-labelledby="game-hub-title">
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <h2 className={styles.title} id="game-hub-title">
            게임
          </h2>
          <p>
            {teacherMode
              ? "학급을 선택하면 학생들과 같은 상시 게임방을 관리할 수 있어요."
              : "언제든 들어가서 친구들과 함께 플레이할 수 있어요."}
          </p>
        </div>
        {teacherMode ? (
          classrooms.length > 0 ? (
            <label className={styles.classroomField}>
              <span>
                <School aria-hidden size={17} strokeWidth={2.2} />
                놀이 학급
              </span>
              <select
                value={selectedClassroomId}
                onChange={(event) => setSelectedClassroomId(event.target.value)}
                disabled={pendingKind !== null}
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name} · {classroom.studentCount}명
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <a className={styles.recordsLink} href="/classroom">
              <School aria-hidden size={18} strokeWidth={2} />
              학급 만들기
            </a>
          )
        ) : (
          <a
            className={styles.recordsLink}
            href="/student/boards?category=play&playTab=records"
          >
            <Trophy aria-hidden size={18} strokeWidth={2} />
            나의 전적
          </a>
        )}
      </header>

      <article className={styles.liveFeature}>
        <div className={styles.liveFeatureCopy}>
          <span className={styles.liveFeatureBadge}>
            <Radio aria-hidden size={15} strokeWidth={2.5} />
            LIVE
          </span>
          <div>
            <p>매일 오후 1:30 · 전체 이용자</p>
            <h3>잼라이브</h3>
            <span>진행자 없이 모두가 같은 문제를 푸는 실시간 4지선다 퀴즈</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.liveFeatureButton}
          onClick={() =>
            router.push(teacherMode ? "/live-quiz" : "/student/live-quiz")
          }
        >
          <CirclePlay aria-hidden size={20} strokeWidth={2.3} />
          잼라이브 입장
        </button>
      </article>

      {teacherMode && !selectedClassroom ? (
        <div className={styles.emptyState} role="status">
          공식 게임방을 열려면 먼저 학급을 만들어 주세요. 잼라이브는 학급 없이도
          바로 참여할 수 있습니다.
        </div>
      ) : null}

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
                <div>
                  <h3 className={styles.cardTitle}>{game.label}</h3>
                  <p className={styles.cardDescription}>{game.description}</p>
                </div>
                <div className={styles.cardFooter}>
                  <span className={styles.statusLabel}>
                    {teacherMode && selectedClassroom
                      ? selectedClassroom.name
                      : game.statusLabel}
                  </span>
                  <button
                    type="button"
                    className={styles.entryButton}
                    disabled={pendingKind !== null || gameEntryDisabled}
                    aria-describedby={error ? `game-hub-error-${kind}` : undefined}
                    onClick={() => void enterGame(kind)}
                  >
                    <CirclePlay aria-hidden size={19} strokeWidth={2.3} />
                    {pending
                      ? "여는 중"
                      : teacherMode
                        ? "게임 열기"
                        : "입장"}
                  </button>
                </div>
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
