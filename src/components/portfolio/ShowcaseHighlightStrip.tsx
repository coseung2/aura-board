"use client";

import { useEffect, useState } from "react";
import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";
import { ShowcaseCardChip } from "./ShowcaseCardChip";
import { PortfolioCardModal } from "./PortfolioCardModal";
import { StarFilledIcon } from "../icons/UiIcons";

type Props = {
  classroomId: string;
  /** "더 보기" 링크 destination — 자랑해요 전용 페이지 */
  hrefBase: string;
};

const STRIP_LIMIT = 10;

export function ShowcaseHighlightStrip({ classroomId, hrefBase }: Props) {
  const [entries, setEntries] = useState<ShowcaseEntryDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<ShowcaseEntryDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${STRIP_LIMIT}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setEntries([]);
          return;
        }
        const body = (await res.json()) as { entries: ShowcaseEntryDTO[] };
        if (!cancelled) setEntries(body.entries);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  if (loading) {
    return (
      <section className="showcase-strip is-loading" aria-label="우리 학급 자랑해요">
        <header className="showcase-strip-head">
          <h2 className="showcase-strip-title">
            <StarFilledIcon size={22} />
            <span>우리 학급 자랑해요</span>
          </h2>
        </header>
        <div className="showcase-strip-row" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="showcase-chip-skeleton" />
          ))}
        </div>
      </section>
    );
  }

  if (!entries || entries.length === 0) {
    // 빈 상태는 섹션 자체 미노출 (조용한 fallback) — design_brief 결정
    return null;
  }

  return (
    <section className="showcase-strip" aria-label="우리 학급 자랑해요">
      <header className="showcase-strip-head">
        <h2 className="showcase-strip-title">
          <StarFilledIcon size={22} />
          <span>우리 학급 자랑해요</span>
        </h2>
        <a className="showcase-strip-more" href={hrefBase}>
          더 보기 →
        </a>
      </header>
      <div className="showcase-strip-row">
        {entries.map((e) => (
          <ShowcaseCardChip
            key={e.cardId + ":" + e.studentId}
            entry={e}
            onOpen={setOpenEntry}
          />
        ))}
      </div>
      <PortfolioCardModal
        card={openEntry?.card ?? null}
        onClose={() => setOpenEntry(null)}
      />
    </section>
  );
}
