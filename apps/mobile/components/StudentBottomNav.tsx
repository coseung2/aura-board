import { useEffect, useState } from "react";
import { usePathname, useRouter, type Href } from "expo-router";
import type { StudentDuty } from "../lib/types";
import {
  isStudentNavTargetActive,
  loadStudentNavPreferences,
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
  subscribeStudentNavPreferences,
  type StudentNavTarget,
} from "../lib/student-navigation";
import { studentNavIcon } from "../lib/student-navigation-icons";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  duties?: StudentDuty[];
};

const SOLID_ACTIVE_ICON_IDS = new Set(["boards", "walking", "more"]);

export function StudentBottomNav({ duties = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [targetIds, setTargetIds] = useState<string[]>(() =>
    studentBaseNavTargets.map((target) => target.id),
  );
  const allTargets = [
    ...studentBaseNavTargets,
    ...studentOptionalNavTargets,
    ...duties
      .map(studentDutyTarget)
      .filter((target): target is StudentNavTarget => target !== null),
  ];
  const targets = targetIds
    .map((id) => allTargets.find((target) => target.id === id))
    .filter((target): target is StudentNavTarget => target !== undefined);

  useEffect(() => {
    void loadStudentNavPreferences().then(setTargetIds);
    return subscribeStudentNavPreferences(setTargetIds);
  }, []);

  return (
    <MobileBottomNav
      accessibilityLabel="학생 주요 메뉴"
      items={targets.map((target) => {
        const active = isStudentNavTargetActive(target, pathname);
        return {
          id: target.id,
          label: target.label,
          Icon: studentNavIcon(target),
          active,
          tinted: target.id.startsWith("duty:"),
          solidActiveIcon: SOLID_ACTIVE_ICON_IDS.has(target.id),
          onPress: () => {
            if (!active) router.push(target.href as Href);
          },
        };
      })}
    />
  );
}
