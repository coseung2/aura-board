export const MEDIA_DEGRADED_MODE_CODE = "media_degraded_mode" as const;

export const MEDIA_DEGRADED_MESSAGE =
  "복구 모드로 이미지·파일과 업로드가 일시적으로 제한될 수 있습니다. 텍스트와 보드 작업은 계속 저장됩니다.";

type MediaDegradedEnvironment = {
  AURA_DR_MEDIA_DEGRADED_MODE?: string;
  [key: string]: string | undefined;
};

/** Only an explicit true/1 flag enables media degraded mode. */
export function isMediaDegradedModeEnabled(
  env: MediaDegradedEnvironment = process.env,
): boolean {
  const value = env.AURA_DR_MEDIA_DEGRADED_MODE;
  return value === "true" || value === "1";
}
