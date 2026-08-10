"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CirclePlay,
  Radio,
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

type GameHubStatus = {
  phase: "open" | "waiting" | "active" | "paused" | "finished";
  label: string;
  playerCount: number;
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
  const [pendingKind, setPendingKind] = useState<OfficialGameKind | null>(null);
  const [pendingClassroomId, setPendingClassroomId] = useState<string | null>(
    null,
  );
  const [classroomPickerKind, setClassroomPickerKind] =
    useState<OfficialGameKind | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<OfficialGameKind, string>>
  >({});
  const [statuses, setStatuses] = useState<
    Partial<Record<OfficialGameKind, GameHubStatus>>
  >({});

  useEffect(() => {
    setPendingKind(null);
    setPendingClassroomId(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadStatuses = async () => {
      const response = await fetch("/api/game-hub/status", {
        cache: "no-store",
        headers: { accept: "application/json" },
      }).catch(() => null);
      if (!response?.ok) return;
      const body = (await response.json().catch(() => null)) as
        | { statuses?: Partial<Record<OfficialGameKind, GameHubStatus>> }
        | null;
      if (!cancelled && body?.statuses) setStatuses(body.statuses);
    };
    void loadStatuses();
    const onFocus = () => void loadStatuses();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(loadStatuses, 15_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  const gameEntryDisabled = teacherMode && classrooms.length === 0;

  async function enterGame(gameKind: OfficialGameKind, classroomId?: string) {
    if (pendingKind) return;
    if (teacherMode && !classroomId) return;

    setPendingKind(gameKind);
    setPendingClassroomId(classroomId ?? null);
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
            teacherMode ? { gameKind, classroomId } : { gameKind },
          ),
        },
      );
      const body = (await response.json().catch(() => null)) as EntryResponse | null;
      if (!response.ok || !body?.href || body.gameKind !== gameKind) {
        throw new Error("game_hub_entry_failed");
      }
      setClassroomPickerKind(null);
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
      setPendingClassroomId(null);
    }
  }

  function requestTeacherGame(gameKind: OfficialGameKind) {
    if (pendingKind || !teacherMode) return;

    if (classrooms.length === 0) {
      setErrors((current) => ({
        ...current,
        [gameKind]: "먼저 학급을 만들어 주세요.",
      }));
      return;
    }

    if (classrooms.length === 1) {
      void enterGame(gameKind, classrooms[0].id);
      return;
    }

    setErrors((current) => ({ ...current, [gameKind]: undefined }));
    setClassroomPickerKind(gameKind);
  }

  const pickerGame = classroomPickerKind
    ? OFFICIAL_GAME_CATALOG[classroomPickerKind]
    : null;

  return (
    <section className={styles.hub} aria-label="게임">
      {teacherMode && classrooms.length === 0 ? (
        <div className={styles.emptyState} role="status">
          공식 게임방을 열려면 먼저 학급을 만들어 주세요. 잼라이브는 학급 없이도
          바로 참여할 수 있습니다.{" "}
          <a className={styles.inlineLink} href="/classroom">
            학급 만들기
          </a>
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.card}>
          <div
            className={`${styles.artwork} ${styles.liveArtwork}`}
            aria-hidden="true"
          >
            <Radio
              className={styles.liveArtworkIcon}
              aria-hidden
              size={52}
              strokeWidth={1.8}
            />
          </div>
          <div className={styles.body}>
            <div>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>잼라이브</h3>
                <span className={`${styles.statusLabel} ${styles.status_live}`}>
                  LIVE
                </span>
              </div>
              <p className={styles.cardDescription}>
                선생님과 함께 실시간 퀴즈에 참여해요.
              </p>
            </div>
            <div className={styles.cardFooter}>
              <button
                type="button"
                className={styles.entryButton}
                aria-label={teacherMode ? "잼라이브 게임 열기" : "잼라이브 입장"}
                onClick={() =>
                  router.push(teacherMode ? "/live-quiz" : "/student/live-quiz")
                }
              >
                <CirclePlay aria-hidden size={19} strokeWidth={2.3} />
                {teacherMode ? "게임 열기" : "입장"}
              </button>
            </div>
          </div>
        </article>

        {GAME_HUB_ORDER.map((kind, index) => {
          const game = OFFICIAL_GAME_CATALOG[kind];
          const pending = pendingKind === kind;
          const error = errors[kind];
          const status = statuses[kind];
          const statusText = status
            ? `${status.label}${status.playerCount > 0 ? ` · ${status.playerCount}명` : ""}`
            : "상태 확인 중";
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
                  <div className={styles.cardTitleRow}>
                    <h3 className={styles.cardTitle}>{game.label}</h3>
                    <span className={`${styles.statusLabel} ${status ? styles[`status_${status.phase}`] : ""}`}>
                      {statusText}
                    </span>
                  </div>
                  <p className={styles.cardDescription}>{game.description}</p>
                </div>
                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    className={styles.entryButton}
                    disabled={pendingKind !== null || gameEntryDisabled}
                    aria-describedby={error ? `game-hub-error-${kind}` : undefined}
                    onClick={() =>
                      teacherMode
                        ? requestTeacherGame(kind)
                        : void enterGame(kind)
                    }
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

      {classroomPickerKind && pickerGame ? (
        <>
          <div
            className="modal-backdrop"
            onClick={() => {
              if (pendingKind) return;
              setClassroomPickerKind(null);
            }}
          />
          <div
            className={`add-card-modal ${styles.classroomPickerModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-hub-classroom-picker-title"
          >
            <div className="modal-header">
              <h2
                className="modal-title"
                id="game-hub-classroom-picker-title"
              >
                학급 선택
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  if (pendingKind) return;
                  setClassroomPickerKind(null);
                }}
                disabled={pendingKind !== null}
              >
                닫기
              </button>
            </div>
            <div className="modal-body">
              <p className={styles.classroomPickerHint}>
                {pickerGame.label} 게임방을 열 학급을 선택하세요.
              </p>
              <div className={styles.classroomPickerList}>
                {classrooms.map((classroom) => {
                  const pendingThis =
                    pendingKind === classroomPickerKind &&
                    pendingClassroomId === classroom.id;
                  return (
                    <button
                      key={classroom.id}
                      type="button"
                      className={styles.classroomPickerOption}
                      disabled={pendingKind !== null}
                      onClick={() =>
                        void enterGame(classroomPickerKind, classroom.id)
                      }
                    >
                      <span className={styles.classroomPickerName}>
                        {classroom.name}
                      </span>
                      <span className={styles.classroomPickerMeta}>
                        {pendingThis
                          ? "여는 중..."
                          : `학생 ${classroom.studentCount}명`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
