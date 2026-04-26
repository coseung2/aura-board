"use client";

import { useEffect, useState } from "react";
import type {
  PortfolioCardDTO,
  PortfolioStudentDTO,
} from "@/lib/portfolio-dto";
import { PortfolioCardItem } from "./PortfolioCardItem";
import { PortfolioCardModal } from "./PortfolioCardModal";

type Props = {
  studentId: string;
  /** 본인 학생 id — 자랑해요 토글 권한 결정용. 학부모/교사 viewer 면 null */
  selfStudentId: string | null;
  /** 자랑해요 토글 진행 중 카드 id (낙관적 표시 + 메뉴 비활성) */
  busyCardId: string | null;
  /** 토글 요청 — 부모(PortfolioPage) 가 useShowcaseToggle 로 처리 */
  onToggleShowcase: (card: PortfolioCardDTO) => void;
  /** 부모가 자랑해요 변경 시 호출 → 이 컴포넌트의 카드 state 패치용 */
  registerCardPatcher?: (
    patch: (cardId: string, on: boolean) => void
  ) => void;
};

export function PortfolioStudentView({
  studentId,
  selfStudentId,
  busyCardId,
  onToggleShowcase,
  registerCardPatcher,
}: Props) {
  const [data, setData] = useState<PortfolioStudentDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<PortfolioCardDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/student-portfolio/${encodeURIComponent(studentId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "forbidden" : "load_failed");
          setData(null);
          return;
        }
        const body = (await res.json()) as PortfolioStudentDTO;
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // 부모가 토글 결과를 알리면 이 컴포넌트의 카드 state 패치.
  useEffect(() => {
    if (!registerCardPatcher) return;
    registerCardPatcher((cardId, on) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              cards: prev.cards.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      isShowcasedByMe: on,
                      hasAnyShowcase: on || c.hasAnyShowcase,
                    }
                  : c
              ),
            }
          : prev
      );
    });
  }, [registerCardPatcher]);

  if (loading && !data) {
    return (
      <section className="portfolio-student-view is-loading">
        <div className="portfolio-student-skeleton" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="portfolio-card-skeleton" />
          ))}
        </div>
      </section>
    );
  }

  if (error === "forbidden") {
    return (
      <section className="portfolio-student-view is-error">
        <div className="portfolio-empty">
          <p>🔒 이 학생의 작품을 볼 권한이 없어요.</p>
        </div>
      </section>
    );
  }
  if (error || !data) {
    return (
      <section className="portfolio-student-view is-error">
        <div className="portfolio-empty">
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
      </section>
    );
  }

  const headTitle = `${data.student.name}의 작품 ${data.cards.length}개`;
  const isViewingSelf = data.student.id === selfStudentId;

  return (
    <section className="portfolio-student-view">
      <header className="portfolio-student-head">
        <h2>📚 {headTitle}</h2>
      </header>
      {data.cards.length === 0 ? (
        <div className="portfolio-empty">
          <p>📭 아직 작품이 없어요</p>
          {isViewingSelf && (
            <a className="portfolio-empty-cta" href="/student">
              + 보드에서 카드 만들기 →
            </a>
          )}
        </div>
      ) : (
        <div className="portfolio-grid">
          {data.cards.map((c) => {
            // 모달에 보이는 카드 객체는 patch state 와 sync — isShowcasedByMe
            // 변경이 모달에도 반영되도록.
            const live = data.cards.find((x) => x.id === c.id) ?? c;
            void live;
            return (
              <PortfolioCardItem
                key={c.id}
                card={c}
                canToggleShowcase={
                  isViewingSelf && selfStudentId !== null
                }
                busy={busyCardId === c.id}
                onToggleShowcase={onToggleShowcase}
                onOpen={setOpenCard}
              />
            );
          })}
        </div>
      )}
      <PortfolioCardModal
        card={openCard ? data.cards.find((c) => c.id === openCard.id) ?? openCard : null}
        onClose={() => setOpenCard(null)}
      />
    </section>
  );
}
