"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";
import { CardDetailModal } from "../cards/CardDetailModal";
import { ShowcaseCardChip } from "./ShowcaseCardChip";
import { portfolioCardToCardData } from "./portfolio-card-adapter";

// student-portfolio (2026-04-26): 자랑해요 전용 페이지의 client view.
// 학급 메인 strip(최신 10개 가로 스크롤) 의 풀버전 — 모든 자랑해요를
// 그리드로 렌더. 클릭 시 보드 카드 상세모달을 그대로 연다.

type Props = {
  classroomId: string;
  classroomName: string;
  /** ← 백 링크 destination. 학생: /student (default), 학부모: /parent/home. */
  backHref?: string;
  backLabel?: string;
};

const FULL_LIMIT = 200;

export function ShowcaseGalleryView({
  classroomId,
  classroomName,
  backHref = "/student",
  backLabel = "학생 메인으로",
}: Props) {
  const [entries, setEntries] = useState<ShowcaseEntryDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<ShowcaseEntryDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/showcase/classroom/${encodeURIComponent(classroomId)}?limit=${FULL_LIMIT}`,
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

  const selectedCard = openEntry?.card ?? null;

  return (
    <>
      <header className="portfolio-page-header">
        <div className="portfolio-page-header-left">
          <Link
            href={backHref}
            className="portfolio-page-back"
            aria-label={backLabel}
          >
            ←
          </Link>
          <h1 className="portfolio-page-title">🌟 우리 학급 자랑해요</h1>
          <span className="portfolio-page-meta">{classroomName}</span>
        </div>
      </header>

      <main className="showcase-gallery">
        {loading && (
          <div className="showcase-gallery-grid" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="showcase-chip-skeleton" />
            ))}
          </div>
        )}
        {!loading && entries && entries.length === 0 && (
          <div className="portfolio-empty">
            <p>📭 아직 자랑해요에 올라온 작품이 없어요.</p>
            <p className="portfolio-empty-hint">
              내 카드 우클릭 메뉴에서 "🌟 자랑해요에 올리기" 를 눌러보세요.
            </p>
          </div>
        )}
        {!loading && entries && entries.length > 0 && (
          <div className="showcase-gallery-grid">
            {entries.map((e) => (
              <ShowcaseCardChip
                key={e.cardId + ":" + e.studentId}
                entry={e}
                onOpen={setOpenEntry}
              />
            ))}
          </div>
        )}
      </main>

      <CardDetailModal
        card={selectedCard ? portfolioCardToCardData(selectedCard) : null}
        onClose={() => setOpenEntry(null)}
        boardId={selectedCard?.sourceBoard.id}
        isStudentViewer={backHref.startsWith("/student")}
      />
    </>
  );
}
