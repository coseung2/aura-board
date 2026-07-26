export const CLASSROOM_ROLE_PAY_PERIODS = ["daily", "weekly", "monthly"] as const;

export type ClassroomRolePayPeriod = (typeof CLASSROOM_ROLE_PAY_PERIODS)[number];

export type ClassroomRoleSettingSnapshot = {
  classroomRoleId: string;
  enabled: boolean;
  salaryAmount: number;
  payPeriod: string;
};

export const LEGACY_ROLE_COMPENSATION = {
  enabled: true,
  salaryAmount: 0,
  payPeriod: "weekly" as ClassroomRolePayPeriod,
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
  };
}
