import type { ReactNode } from "react";

import { ClassroomSectionHeader } from "./ClassroomSectionHeader";

export type ClassroomFeatureKey = "walking" | "daily-banners" | "reading";

type Props = {
  classroomId: string;
  eyebrow: string;
  description?: ReactNode;
  active: ClassroomFeatureKey;
};

const FEATURE_TITLES: Record<ClassroomFeatureKey, string> = {
  walking: "걷기",
  "daily-banners": "배너 관리",
  reading: "독서",
};

export function ClassroomFeatureHeader({
  classroomId,
  eyebrow,
  description,
  active,
}: Props) {
  return (
    <ClassroomSectionHeader
      classroomId={classroomId}
      eyebrow={eyebrow}
      title={FEATURE_TITLES[active]}
      description={description}
      ariaLabel="자율활동"
      links={[]}
      activeKey={active}
    />
  );
}
