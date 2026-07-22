import { BookOpen, House, Presentation, type LucideIcon } from "lucide-react";

type RoleId = "teacher" | "student" | "parent";

const ROLE_ICONS: Record<RoleId, LucideIcon> = {
  teacher: Presentation,
  student: BookOpen,
  parent: House,
};

/** Keep web login role imagery aligned with the Lucide icons used by mobile. */
export function RoleIcon({ role }: { role: RoleId }) {
  const Icon = ROLE_ICONS[role];
  return <Icon size={48} strokeWidth={2} aria-hidden />;
}
