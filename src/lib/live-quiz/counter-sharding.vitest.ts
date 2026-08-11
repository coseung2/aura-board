import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LIVE_QUIZ_COUNTER_SHARDS,
  liveQuizCounterShard,
} from "./counter-sharding";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260811_shard_global_live_quiz_counters/migration.sql",
);

// Test-only oracle vectors. These values are the SQL contract's first eight
// MD5 hex digits modulo 128, kept fixed so this test does not reimplement the
// production hash and accidentally agree with a changed implementation.
const SHARD_ORACLE_VECTORS = [
  { participantType: "student", participantId: "student-42", shard: 7 },
  { participantType: "teacher", participantId: "teacher-7", shard: 96 },
] as const;

function readShardMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("global live quiz counter sharding", () => {
  it("matches fixed SQL-compatible shard oracle vectors", () => {
    for (const vector of SHARD_ORACLE_VECTORS) {
      expect(
        liveQuizCounterShard(vector.participantType, vector.participantId),
      ).toBe(vector.shard);
    }
  });

  it("maps retries for one participant to one stable shard", () => {
    const first = liveQuizCounterShard("student", "student-42");
    expect(liveQuizCounterShard("student", "student-42")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(LIVE_QUIZ_COUNTER_SHARDS);
  });

  it("uses the same shard contract for SQL backfill and insert triggers", () => {
    const migration = readShardMigration();
    const originalMigration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260806_add_global_live_quiz/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("substr(md5(participant_type || ':' || participant_id), 1, 8)");
    expect(migration).toContain('% 128');
    expect(
      migration.match(/"liveQuizCounterShard"\(/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("COUNT(*)::integer");
    expect(originalMigration).toContain(
      '"sessionId", "questionId", "participantType", "participantId"',
    );
  });

  it("holds an answer-writer-blocking lock through backfill and trigger cutover", () => {
    const migration = readShardMigration();
    const beginAt = migration.indexOf("BEGIN;");
    const lockAt = migration.indexOf(
      'LOCK TABLE "LiveQuizAnswer" IN SHARE ROW EXCLUSIVE MODE;',
    );
    const backfillAt = migration.indexOf(
      'INSERT INTO "LiveQuizQuestionCounterShard"',
    );
    const oldTriggerDropAt = migration.indexOf(
      'DROP TRIGGER "LiveQuizAnswer_increment_realtime_counter"',
    );
    const newTriggerAt = migration.indexOf(
      'CREATE TRIGGER "LiveQuizAnswer_increment_realtime_counter_shard"',
    );
    const publicationSwapAt = migration.indexOf(
      'ALTER PUBLICATION supabase_realtime DROP TABLE',
    );
    const commitAt = migration.lastIndexOf("COMMIT;");

    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(beginAt).toBeLessThan(lockAt);
    expect(lockAt).toBeLessThan(backfillAt);
    expect(backfillAt).toBeLessThan(oldTriggerDropAt);
    expect(oldTriggerDropAt).toBeLessThan(newTriggerAt);
    expect(newTriggerAt).toBeLessThan(publicationSwapAt);
    expect(publicationSwapAt).toBeLessThan(commitAt);
  });

  it("fully retires public access to the legacy aggregate projection", () => {
    const migration = readShardMigration();
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "LiveQuizQuestionCounter_select"',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "LiveQuizQuestionCounter" FROM PUBLIC;',
    );
    expect(migration).toContain(
      'REVOKE SELECT ON TABLE public."LiveQuizQuestionCounter" FROM anon',
    );
    expect(migration).toContain(
      'REVOKE SELECT ON TABLE public."LiveQuizQuestionCounter" FROM authenticated',
    );
  });

  it("spreads an all-user answer burst instead of targeting one counter row", () => {
    const counts = Array.from({ length: LIVE_QUIZ_COUNTER_SHARDS }, () => 0);
    for (let index = 0; index < 10_000; index += 1) {
      counts[liveQuizCounterShard("student", `participant-${index}`)] += 1;
    }

    expect(counts.filter((count) => count > 0)).toHaveLength(
      LIVE_QUIZ_COUNTER_SHARDS,
    );
    expect(Math.max(...counts)).toBeLessThan(110);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(10_000);
  });
});
