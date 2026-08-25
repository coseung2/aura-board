"use client";

import { useState } from "react";

import { ClassroomRolePanel } from "./ClassroomRolePanel";
import { ClassroomSectionHeader } from "./ClassroomSectionHeader";
import type { RoleStudent } from "./useClassroomRolePanel";

type Props = {
  classroomId: string;
  classroomName: string;
  unit: string;
  students: RoleStudent[];
};

export function ClassroomRolesView({
  classroomId,
  classroomName,
  unit,
  students,
}: Props) {
  const [payBarSlot, setPayBarSlot] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <ClassroomSectionHeader
        classroomId={classroomId}
        eyebrow={classroomName}
        title="1인 1역"
        ariaLabel="1인 1역 메뉴"
        links={[]}
        activeKey="roles"
        actions={<div ref={setPayBarSlot} className="classroom-role-header-actions" />}
      />
      <ClassroomRolePanel
        classroomId={classroomId}
        unit={unit}
        students={students}
        payBarSlot={payBarSlot}
        payBarPlacement="header"
      />
    </>
  );
}
