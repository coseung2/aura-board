import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260802160000_game_ui_platform",
    "migration.sql",
  ),
  "utf8",
);

describe("game UI platform migration", () => {
  it("normalizes and constrains the official five PLAY layouts", () => {
    for (const layout of [
      "kordle",
      "speed-game",
      "shadow-alliance",
      "omok",
      "song-guess",
    ]) {
      expect(migration).toContain(`'${layout}'`);
    }
    expect(migration).toContain('CONSTRAINT "Board_category_layout_check"');
    expect(migration).toContain('SET "category" = \'LESSON\'');
  });

  it("adds one server-owned canonical game room per classroom and kind", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "systemGameKind" TEXT');
    expect(migration).toContain('CONSTRAINT "Board_system_game_kind_check"');
    expect(migration).toContain('"systemGameKind" = "layout"');
    expect(migration).toContain('UNIQUE INDEX "Board_classroomId_systemGameKind_key"');
  });

  it("adds append-only result identity and deterministic pagination indexes", () => {
    expect(migration).toContain('CREATE TABLE public."GameResult"');
    expect(migration).toContain('CONSTRAINT "GameResult_idempotency_key_key" UNIQUE');
    expect(migration).toContain('UNIQUE INDEX "GameResult_gameKind_sourceId_studentId_key"');
    expect(migration).toContain('INDEX "GameResult_studentId_completedAt_id_idx"');
    expect(migration).toContain('"metrics" JSONB NOT NULL');
  });

  it("does not create historical game results during schema migration", () => {
    expect(migration).toContain(
      "Historical GameResult rows are intentionally not created by this migration",
    );
    expect(migration).not.toMatch(/INSERT INTO public\."GameResult"/);
    expect(migration).not.toMatch(/FROM public\."SpeedGameAnswer"/);
  });

  it("backfills participant identity only across a proven classroom boundary", () => {
    expect(migration).toContain(
      'JOIN public."Student" AS student ON student."classroomId" = board."classroomId"',
    );
    expect(migration).toContain(
      'participant."actorSubject" = \'student:\' || student."id"',
    );
    expect(migration).toContain(
      'CONSTRAINT "PlayParticipant_actor_student_check"',
    );
  });

  it("adds lifecycle identity and immutable speed-game runs", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "startedAtMs" BIGINT');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "studentId" TEXT');
    expect(migration).toContain('CREATE TABLE public."SpeedGameRun"');
    expect(migration).toContain('CREATE TABLE public."SpeedGameRunParticipant"');
    expect(migration).toContain('CREATE TABLE public."SpeedGameRunRound"');
    expect(migration).toContain('UNIQUE INDEX "SpeedGameRun_current_board_key"');
    expect(migration).not.toContain('CREATE TABLE public."ShadowAllianceRun"');
    expect(migration).toContain("'shadow-alliance'");
    expect(migration).toContain("'shadow_alliance_board_create'");
    expect(migration).toContain("'shadow_alliance_session_command'");
    expect(migration).toContain("'shadow_alliance_session_rematch'");
  });

  it("forces server-only RLS for authority, receipts, runs, and results", () => {
    for (const table of [
      "GameResult",
      "PlaySession",
      "PlayParticipant",
      "PlayRequestReceipt",
      "PlayOutbox",
      "KordlePuzzle",
      "KordleAttempt",
      "KordleGuess",
      "SpeedGameRun",
      "SpeedGameRunGroup",
      "SpeedGameRunParticipant",
      "SpeedGameRunRound",
      "SpeedGameRunAnswer",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public."${table}" FORCE ROW LEVEL SECURITY`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON TABLE public."${table}" FROM anon, authenticated`,
      );
    }
  });
});
