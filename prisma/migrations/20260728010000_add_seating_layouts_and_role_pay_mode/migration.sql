CREATE TABLE "ClassroomSeatingLayout" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomSeatingLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomSeatingLayout_classroomId_name_key"
    ON "ClassroomSeatingLayout"("classroomId", "name");
CREATE INDEX "ClassroomSeatingLayout_classroomId_idx"
    ON "ClassroomSeatingLayout"("classroomId");

ALTER TABLE "ClassroomSeatingLayout"
    ADD CONSTRAINT "ClassroomSeatingLayout_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassroomRoleSetting"
    ADD COLUMN "payMode" TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN "payAnchor" INTEGER;

ALTER TABLE "ClassroomRoleSetting"
    ADD CONSTRAINT "ClassroomRoleSetting_payMode_check"
    CHECK ("payMode" IN ('manual', 'auto'));

ALTER TABLE "ClassroomRoleSetting"
    ADD CONSTRAINT "ClassroomRoleSetting_payAnchor_check"
    CHECK ("payAnchor" IS NULL OR ("payAnchor" >= 1 AND "payAnchor" <= 31));
