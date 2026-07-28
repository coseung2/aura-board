"use client";

import { useCallback, useEffect, useState } from "react";

export type ReadingTitleProgress = {
  key: string;
  label: string;
  imagePath: string;
  requirement: string;
  effectKey: string;
  buffBps: number;
  earned: boolean;
  claimed: boolean;
};

const EFFECT_LABELS: Record<string, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 보상",
  comment_reward: "댓글 보상",
};

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    message?: unknown;
  };
  if (typeof body.message === "string") return body.message;
  if (body.error === "not_earned") return "아직 달성하지 않은 칭호예요.";
  return fallback;
}

export function ReadingTitles() {
  const [titles, setTitles] = useState<ReadingTitleProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/student/titles", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "독서 칭호를 불러오지 못했어요."),
        );
      }
      const payload = (await response.json()) as {
        reading?: ReadingTitleProgress[];
      };
      setTitles(Array.isArray(payload.reading) ? payload.reading : []);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "독서 칭호를 불러오지 못했어요.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(titleKey: string) {
    if (claimingKey) return;
    setClaimingKey(titleKey);
    setClaimError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/student/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleKey }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, "칭호를 받지 못했어요. 다시 시도해 주세요."),
        );
      }
      const payload = (await response.json()) as {
        titles?: ReadingTitleProgress[];
      };
      if (Array.isArray(payload.titles)) setTitles(payload.titles);
      setNotice("칭호를 받았어요. 펫 꾸미기에서 붙일 수 있어요.");
    } catch (error) {
      setClaimError(
        error instanceof Error
          ? error.message
          : "칭호를 받지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setClaimingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="reading-titles-state" role="status" aria-live="polite">
        독서 칭호를 불러오는 중이에요.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="reading-titles-state reading-titles-error" role="alert">
        <p>{loadError}</p>
        <button type="button" className="reading-title-retry" onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }

  if (titles.length === 0) {
    return (
      <div className="reading-titles-state">
        <strong>표시할 독서 칭호가 아직 없어요.</strong>
        <p>독서 기록을 쌓으면 새로운 칭호가 열려요.</p>
      </div>
    );
  }

  const claimedCount = titles.filter((title) => title.claimed).length;

  return (
    <section className="reading-titles" aria-labelledby="reading-titles-heading">
      <div className="reading-titles-heading">
        <div>
          <p className="reading-titles-eyebrow">독서 성취</p>
          <h2 id="reading-titles-heading">칭호</h2>
        </div>
        <span aria-label={`${titles.length}개 중 ${claimedCount}개 수령`}>
          {claimedCount} / {titles.length}
        </span>
      </div>

      {claimedCount === 0 ? (
        <p className="reading-titles-hint">
          독서 기록을 쌓으면 칭호를 얻을 수 있어요.
        </p>
      ) : null}
      {notice ? (
        <p className="reading-titles-notice" role="status">
          {notice}
        </p>
      ) : null}
      {claimError ? (
        <p className="reading-titles-error-message" role="alert">
          {claimError}
        </p>
      ) : null}

      <ul className="reading-title-list">
        {titles.map((title) => {
          const claimable = title.earned && !title.claimed;
          const effectLabel = EFFECT_LABELS[title.effectKey] ?? "보상";
          const buffText = `${effectLabel} +${title.buffBps / 100}%`;
          const stateLabel = title.claimed
            ? "수령 완료"
            : claimable
              ? "수령 가능"
              : "미달성";

          return (
            <li
              key={title.key}
              className={`reading-title-item${claimable ? " is-claimable" : ""}${
                title.earned ? " is-earned" : " is-locked"
              }`}
              aria-label={`${title.label} 칭호, ${title.requirement}, ${buffText}, ${stateLabel}`}
            >
              <div className="reading-title-image-wrap">
                <img
                  className="reading-title-image"
                  src={title.imagePath}
                  alt=""
                  aria-hidden="true"
                />
              </div>
              <div className="reading-title-copy">
                <div className="reading-title-name-row">
                  <strong>{title.label}</strong>
                  {!title.earned ? (
                    <span className="reading-title-lock" aria-hidden="true">
                      잠김
                    </span>
                  ) : null}
                </div>
                <p>{title.requirement}</p>
                <span className="reading-title-meta">
                  {stateLabel} · {buffText}
                </span>
              </div>
              {claimable ? (
                <button
                  type="button"
                  className="reading-title-claim"
                  disabled={claimingKey !== null}
                  onClick={() => void claim(title.key)}
                  aria-label={`${title.label} 칭호 수령`}
                >
                  {claimingKey === title.key ? "받는 중..." : "받기"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
