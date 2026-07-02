import "server-only";
import { db } from "./db";

/**
 * Permission catalog — source of truth for bank/store capabilities.
 *
 * defaultRoles: when a classroom has NO `ClassroomRolePermission` row for a
 * permission, these roles have it. Once a teacher writes any override row
 * for a permission, the default is ignored entirely (explicit takes over).
 *
 * To add a new permission: append here + wire into the guard at the route.
 * To add a new role: seed `ClassroomRoleDef` + decide defaultRoles.
 */
export const PERMISSION_CATALOG = {
  "bank.deposit": {
    label: "통장 입금",
    description: "학생에게 저축 금액을 입금 처리",
    category: "bank",
    defaultRoles: ["banker"],
  },
  "bank.withdraw": {
    label: "통장 출금",
    description: "학생이 통장에서 현금으로 인출 처리",
    category: "bank",
    defaultRoles: ["banker"],
  },
  "bank.fd.open": {
    label: "적금 가입",
    description: "학생 통장에서 적금 상품 가입 처리",
    category: "bank",
    defaultRoles: ["banker"],
  },
  "bank.fd.cancel": {
    label: "적금 중도해지",
    description: "가입된 적금 해지 (원금만 반환)",
    category: "bank",
    defaultRoles: ["banker"],
  },
  "store.item.manage": {
    label: "매점 상품 관리",
    description: "매점 상품 추가/수정/보관",
    category: "store",
    defaultRoles: ["store-clerk"],
  },
  "store.charge": {
    label: "매점 카드 결제",
    description: "학생 카드 QR을 스캔해 결제 처리",
    category: "store",
    defaultRoles: ["store-clerk"],
  },
  "checks.manage": {
    label: "제출 체크",
    description: "숙제·가정통신문 등 제출 여부 기록",
    category: "checks",
    defaultRoles: ["checker"],
  },
  "inspections.cleaning": {
    label: "청소 검사",
    description: "교실 좌석·책상 청소 상태 기록 (사진 첨부 가능)",
    category: "inspections",
    defaultRoles: ["cleaning-inspector"],
  },
  "inspections.shoes": {
    label: "신발 검사",
    description: "아침마다 신발 정돈 상태가 어긋난 학생 기록",
    category: "inspections",
    defaultRoles: ["shoe-inspector"],
  },
} as const;

export type PermissionKey = keyof typeof PERMISSION_CATALOG;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_CATALOG) as PermissionKey[];

export function categorizedPermissions() {
  const groups: Record<string, PermissionKey[]> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    const cat = PERMISSION_CATALOG[key].category;
    (groups[cat] ??= []).push(key);
  }
  return groups;
}

/**
 * Resolve whether a caller has `permission` in `classroomId`.
 *
 * Resolution order:
 *   1) If the caller is the classroom's teacher, always grant.
 *   2) Otherwise require a student caller with at least one role assignment
 *      in the classroom. Look up ClassroomRolePermission overrides first —
 *      if ANY override exists for `(classroomId, permission)`, the default
 *      catalog is ignored (explicit teacher decision wins both ways).
 *      If no override rows exist for that permission, fall back to
 *      PERMISSION_CATALOG.defaultRoles.
 */
export async function hasPermission(
  classroomId: string,
  identity: { userId?: string | null; studentId?: string | null },
  permission: PermissionKey
): Promise<boolean> {
  // 1) Teacher always wins
  if (identity.userId) {
    const c = await db.classroom.findUnique({
      where: { id: classroomId },
      select: { teacherId: true },
    });
    if (c && c.teacherId === identity.userId) return true;
  }

  // 2) Student path requires role assignment
  if (!identity.studentId) return false;
  const assignments = await db.classroomRoleAssignment.findMany({
    where: { classroomId, studentId: identity.studentId },
    select: { classroomRole: { select: { key: true } } },
  });
  if (assignments.length === 0) return false;
  const roleKeys = assignments.map((a) => a.classroomRole.key);

  // 3) Check if any role has an explicit grant for this permission
  const explicitGrant = await db.classroomRolePermission.findFirst({
    where: {
      classroomId,
      roleKey: { in: roleKeys },
      permission,
      granted: true,
    },
    select: { id: true },
  });
  if (explicitGrant) return true;

  // 4) If any override row exists for this permission (regardless of role),
  //    the teacher has explicitly configured — don't fall back to defaults.
  const anyOverride = await db.classroomRolePermission.findFirst({
    where: { classroomId, permission },
    select: { id: true },
  });
  if (anyOverride) return false;

  // 5) No override → catalog defaults
  const entry = PERMISSION_CATALOG[permission];
  if (!entry) return false;
  return entry.defaultRoles.some((r) => roleKeys.includes(r));
}
