import { createHash } from "crypto";

export const LIVE_QUIZ_COUNTER_SHARDS = 128;

export function liveQuizCounterShard(
  participantType: string,
  participantId: string,
): number {
  const digest = createHash("md5")
    .update(participantType)
    .update(":")
    .update(participantId)
    .digest();
  return digest.readUInt32BE(0) % LIVE_QUIZ_COUNTER_SHARDS;
}
