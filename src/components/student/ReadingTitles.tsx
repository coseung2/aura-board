"use client";

import { useCallback, useEffect, useState } from "react";

import {
  StudentTitleCollection,
  type StudentTitleProgress,
} from "./StudentTitleCollection";

export type ReadingTitleProgress = StudentTitleProgress;

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
      <div className="student-activity-state" role="status" aria-live="polite">
        독서 칭호를 불러오는 중이에요.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="student-activity-state is-error" role="alert">
        <p>{loadError}</p>
        <button type="button" className="student-activity-retry" onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }

  if (titles.length === 0) {
    return (
      <div className="student-activity-state">
        <strong>표시할 독서 칭호가 아직 없어요.</strong>
        <p>독서 기록을 쌓으면 새로운 칭호가 열려요.</p>
      </div>
    );
  }

  return (
    <div className="student-title-content">
      {notice ? (
        <p className="student-activity-notice" role="status">
          {notice}
        </p>
      ) : null}
      {claimError ? (
        <p className="student-activity-error" role="alert">
          {claimError}
        </p>
      ) : null}
      <StudentTitleCollection
        titles={titles}
        emptyHint="독서 기록을 쌓으면 칭호를 얻을 수 있어요."
        claimingKey={claimingKey}
        onClaim={(titleKey) => void claim(titleKey)}
      />
    </div>
  );
}
