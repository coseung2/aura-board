import type { ReactNode } from "react";

import { ClassroomSectionHeader } from "./ClassroomSectionHeader";

export type ClassroomFeatureKey = "walking" | "daily-banners" | "reading";

type Props = {
  classroomId: string;
  eyebrow: string;
  description?: ReactNode;
  active: ClassroomFeatureKey;
};

const FEATURE_LINKS: Array<{
  key: ClassroomFeatureKey;
  label: string;
  path: string;
}> = [
  { key: "walking", label: "걷기 현황", path: "walking" },
  { key: "daily-banners", label: "배너 관리", path: "daily-banners" },
  { key: "reading", label: "독서", path: "reading" },
];

export function ClassroomFeatureHeader({
  classroomId,
  eyebrow,
  description,
  active,
}: Props) {
  const basePath = `/classroom/${classroomId}`;

  return (
    <ClassroomSectionHeader
      classroomId={classroomId}
      eyebrow={eyebrow}
      title="기타 활동"
      description={description}
      ariaLabel="기타 활동"
      links={FEATURE_LINKS.map(({ key, label, path }) => ({
        key,
        label,
        href: `${basePath}/${path}`,
      }))}
      activeKey={active}
    />
  );
}
