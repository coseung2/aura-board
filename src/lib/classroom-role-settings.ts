export const CLASSROOM_ROLE_PAY_PERIODS = ["daily", "weekly", "monthly"] as const;

export type ClassroomRolePayPeriod = (typeof CLASSROOM_ROLE_PAY_PERIODS)[number];

export const CLASSROOM_ROLE_PAY_MODES = ["auto", "manual"] as const;

export type ClassroomRolePayMode = (typeof CLASSROOM_ROLE_PAY_MODES)[number];

export type ClassroomRoleSettingSnapshot = {
  classroomRoleId: string;
  enabled: boolean;
  salaryAmount: number;
  payPeriod: string;
  payMode?: string | null;
  payAnchor?: number | null;
};

export const LEGACY_ROLE_COMPENSATION = {
  enabled: true,
  salaryAmount: 0,
  payPeriod: "weekly" as ClassroomRolePayPeriod,
  payMode: "manual" as ClassroomRolePayMode,
  payAnchor: null as number | null,
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
    payPeriod: setting.payPeriod as ClassroomRolePayPeriod,
    payMode: (setting.payMode === "auto" ? "auto" : "manual") as ClassroomRolePayMode,
    payAnchor: setting.payAnchor ?? null,
  };
}
