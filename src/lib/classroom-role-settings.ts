export const CLASSROOM_ROLE_PAY_PERIODS = ["daily", "weekly", "monthly"] as const;

export type ClassroomRolePayPeriod = (typeof CLASSROOM_ROLE_PAY_PERIODS)[number];

export const CLASSROOM_ROLE_PAY_MODES = ["auto", "manual"] as const;

export type ClassroomRolePayMode = (typeof CLASSROOM_ROLE_PAY_MODES)[number];

export type ClassroomRoleSettingSnapshot = {
  classroomRoleId: string;
  enabled: boolean;
  salaryAmount: number;
};

/**
 * 급여 지급 정책은 학급 단위 값이다. 정책 행이 없는 학급은 수동지급 + 주급으로
 * 해석한다(월요일 기준).
 */
export type ClassroomRolePayPolicySnapshot = {
  payMode: string;
  payPeriod: string;
  payAnchor: number | null;
};

export const DEFAULT_ROLE_PAY_POLICY = {
  payMode: "manual" as ClassroomRolePayMode,
  payPeriod: "weekly" as ClassroomRolePayPeriod,
  payAnchor: null as number | null,
};

export const LEGACY_ROLE_COMPENSATION = {
  enabled: true,
  salaryAmount: 0,
};

export function resolveClassroomRoleSetting(
  classroomRoleId: string,
  settings: readonly ClassroomRoleSettingSnapshot[],
) {
  const setting = settings.find((candidate) => candidate.classroomRoleId === classroomRoleId);
  if (!setting) return LEGACY_ROLE_COMPENSATION;

  return {
    enabled: setting.enabled,
    salaryAmount: setting.salaryAmount,
  };
}

/** Normalizes a stored (or missing) pay policy row into a complete value. */
export function resolveClassroomRolePayPolicy(
  policy: ClassroomRolePayPolicySnapshot | null | undefined,
) {
  if (!policy) return DEFAULT_ROLE_PAY_POLICY;

  const payPeriod = (
    CLASSROOM_ROLE_PAY_PERIODS as readonly string[]
  ).includes(policy.payPeriod)
    ? (policy.payPeriod as ClassroomRolePayPeriod)
    : DEFAULT_ROLE_PAY_POLICY.payPeriod;

  return {
    payMode: (policy.payMode === "auto" ? "auto" : "manual") as ClassroomRolePayMode,
    payPeriod,
    // 일급은 기준일이 필요 없다.
    payAnchor: payPeriod === "daily" ? null : policy.payAnchor ?? 1,
  };
}
