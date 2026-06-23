-- Aura 평가 모드 (2026-06-23)
-- 일반 카드/그리드 보드에서 교사가 카드별 상/중/하 등급만 남기면, 같은
-- (학생, 과목, 단원, 평가항목) 조합의 AiFeedback row 가 deterministic fixed
-- text 로 upsert 된다. Aura 측은 기존 GET /api/external/feedbacks 로
-- 끌어간다 — 별도 export 시스템은 만들지 않는다.
--
-- Board.auraEvaluationEnabled / auraSubject / auraUnit / auraCriterion:
--   보드 단위 토글 + 평가 기준 식별자. enabled 가 true 이고 세 필드가 모두
--   비어있지 않을 때만 카드 단위 평가가 가능.
--
-- CardEvaluation: 카드 x 학생 단위의 최신 등급 캐시. @@unique([cardId]) 로
-- 같은 카드에 여러 등급이 누적되지 않도록 한다. aiFeedbackId 는 매칭된
-- AiFeedback.id (nullable, 모드 비활성 이전 row 호환).

ALTER TABLE "Board"
  ADD COLUMN "auraEvaluationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Board" ADD COLUMN "auraSubject" TEXT;
ALTER TABLE "Board" ADD COLUMN "auraUnit" TEXT;
ALTER TABLE "Board" ADD COLUMN "auraCriterion" TEXT;

CREATE TABLE "CardEvaluation" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "comment" TEXT,
    "aiFeedbackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardEvaluation_cardId_key" ON "CardEvaluation"("cardId");
CREATE INDEX "CardEvaluation_boardId_studentId_idx" ON "CardEvaluation"("boardId", "studentId");
CREATE INDEX "CardEvaluation_boardId_teacherId_idx" ON "CardEvaluation"("boardId", "teacherId");
CREATE INDEX "CardEvaluation_studentId_updatedAt_idx" ON "CardEvaluation"("studentId", "updatedAt");

ALTER TABLE "CardEvaluation" ADD CONSTRAINT "CardEvaluation_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardEvaluation" ADD CONSTRAINT "CardEvaluation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardEvaluation" ADD CONSTRAINT "CardEvaluation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardEvaluation" ADD CONSTRAINT "CardEvaluation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: 다른 Prisma-managed 테이블과 동일한 posture — enabled, broad policy
-- 없음. 서버측 Prisma 라우트(Role-bypass DATABASE_URL) 경유로만 접근.
ALTER TABLE public."CardEvaluation" ENABLE ROW LEVEL SECURITY;