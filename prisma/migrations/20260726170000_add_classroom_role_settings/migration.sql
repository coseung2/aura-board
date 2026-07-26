CREATE TABLE "ClassroomRoleSetting" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "classroomRoleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "salaryAmount" INTEGER NOT NULL DEFAULT 0,
    "payPeriod" TEXT NOT NULL DEFAULT 'weekly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomRoleSetting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClassroomRoleSetting_salaryAmount_check" CHECK ("salaryAmount" >= 0),
    CONSTRAINT "ClassroomRoleSetting_payPeriod_check" CHECK ("payPeriod" IN ('daily', 'weekly', 'monthly'))
);

CREATE UNIQUE INDEX "ClassroomRoleSetting_classroomId_classroomRoleId_key"
    ON "ClassroomRoleSetting"("classroomId", "classroomRoleId");
CREATE INDEX "ClassroomRoleSetting_classroomRoleId_idx"
    ON "ClassroomRoleSetting"("classroomRoleId");

ALTER TABLE "ClassroomRoleSetting" ADD CONSTRAINT "ClassroomRoleSetting_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRoleSetting" ADD CONSTRAINT "ClassroomRoleSetting_classroomRoleId_fkey"
    FOREIGN KEY ("classroomRoleId") REFERENCES "ClassroomRoleDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
