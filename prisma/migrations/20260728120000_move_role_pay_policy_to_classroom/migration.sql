-- 1인1역 급여 지급 정책을 역할 단위에서 학급 단위로 이동 (2026-07-28)
--
-- 지급 방식/주기/기준일은 역할마다 다르게 둘 이유가 없다. 개별 지급이 필요하면
-- 금융관리에서 처리한다. 역할별로 같은 값을 복제하던 구조 때문에 토글 한 번에
-- 역할 수만큼 PATCH가 발생하고, 값이 어긋나면 대시보드가 혼합 상태로 보였다.
--
-- 기존 값은 학급별 다수값(최빈값)으로 이관하고, ClassroomRoleSetting 에서는
-- payMode/payPeriod/payAnchor 를 제거한다. salaryAmount 는 역할별로 유지한다.

CREATE TABLE "ClassroomRolePayPolicy" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "payMode" TEXT NOT NULL DEFAULT 'manual',
    "payPeriod" TEXT NOT NULL DEFAULT 'weekly',
    "payAnchor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomRolePayPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClassroomRolePayPolicy_payMode_check"
        CHECK ("payMode" IN ('manual', 'auto')),
    CONSTRAINT "ClassroomRolePayPolicy_payPeriod_check"
        CHECK ("payPeriod" IN ('daily', 'weekly', 'monthly')),
    CONSTRAINT "ClassroomRolePayPolicy_payAnchor_check"
        CHECK ("payAnchor" IS NULL OR ("payAnchor" >= 1 AND "payAnchor" <= 31))
);

CREATE UNIQUE INDEX "ClassroomRolePayPolicy_classroomId_key"
    ON "ClassroomRolePayPolicy"("classroomId");

ALTER TABLE "ClassroomRolePayPolicy"
    ADD CONSTRAINT "ClassroomRolePayPolicy_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 학급별 최빈 조합을 승격한다. 동수일 때는 payMode/payPeriod/payAnchor 순으로
-- 정렬해 결정적으로 하나를 고른다.
INSERT INTO "ClassroomRolePayPolicy" ("id", "classroomId", "payMode", "payPeriod", "payAnchor")
SELECT DISTINCT ON ("classroomId")
       gen_random_uuid()::text,
       "classroomId",
       "payMode",
       "payPeriod",
       "payAnchor"
FROM (
    SELECT "classroomId",
           "payMode",
           "payPeriod",
           "payAnchor",
           COUNT(*) AS "roleCount"
    FROM "ClassroomRoleSetting"
    GROUP BY "classroomId", "payMode", "payPeriod", "payAnchor"
) AS "grouped"
ORDER BY "classroomId", "roleCount" DESC, "payMode", "payPeriod", "payAnchor" NULLS LAST;

ALTER TABLE "ClassroomRoleSetting"
    DROP CONSTRAINT IF EXISTS "ClassroomRoleSetting_payPeriod_check",
    DROP CONSTRAINT IF EXISTS "ClassroomRoleSetting_payMode_check",
    DROP CONSTRAINT IF EXISTS "ClassroomRoleSetting_payAnchor_check";

ALTER TABLE "ClassroomRoleSetting"
    DROP COLUMN "payPeriod",
    DROP COLUMN "payMode",
    DROP COLUMN "payAnchor";

-- 다른 학급 스코프 테이블과 동일하게 RLS 를 켠다. 접근은 서버 라우트에서
-- 교사 소유 검사로 통제하고, 익명 클라이언트 직접 접근은 허용하지 않는다.
ALTER TABLE "ClassroomRolePayPolicy" ENABLE ROW LEVEL SECURITY;
