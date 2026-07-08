/**
 * Feature flags (2026-07-08)
 *
 * 화면에 보이지만 아직 완전하지 않은 기능을 일시적으로 숨길 때 사용한다.
 * 운영(production)에서는 기본적으로 꺼져 있고, 개발/프리뷰 환경과
 * 환경변수 `NEXT_PUBLIC_FF_<NAME>=1` 이 켜져 있을 때만 노출된다.
 *
 * 추가 규칙이 필요하면 이 헬퍼에 모드로 추가하면 된다.
 */
export type FeatureFlag = "breakoutSettings";

const ENV_OVERRIDE_PREFIX = "NEXT_PUBLIC_FF_";

function isExplicitlyEnabled(flag: FeatureFlag): boolean {
  const key = `${ENV_OVERRIDE_PREFIX}${flag}`;
  const raw = process.env[key];
  if (raw == null) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

function isExplicitlyDisabled(flag: FeatureFlag): boolean {
  const key = `${ENV_OVERRIDE_PREFIX}${flag}`;
  const raw = process.env[key];
  if (raw == null) return false;
  return raw === "0" || raw.toLowerCase() === "false";
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (isExplicitlyDisabled(flag)) return false;
  if (isExplicitlyEnabled(flag)) return true;
  // 기본값: development 또는 preview 환경에서만 켠다.
  return process.env.NODE_ENV !== "production";
}
