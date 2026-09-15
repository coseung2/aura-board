import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260801140000_authoritative_play_platform",
    "migration.sql",
  ),
  "utf8",
);

const omokPrivateRoomsMigration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260915173000_add_omok_private_rooms",
    "migration.sql",
  ),
  "utf8",
);

describe("authoritative play platform migration", () => {
  it("persists aggregate state, server-owned slots, receipts, and outbox", () => {
    expect(migration).toContain('CREATE TABLE public."PlaySession"');
    expect(migration).toContain('CREATE TABLE public."PlayParticipant"');
    expect(migration).toContain('CREATE TABLE public."PlayRequestReceipt"');
    expect(migration).toContain('CREATE TABLE public."PlayOutbox"');
    expect(migration).toContain('"state" JSONB NOT NULL');
    expect(migration).toContain('"response" JSONB NOT NULL');
    expect(migration).toContain('UNIQUE INDEX "PlayParticipant_sessionId_slot_key"');
  });

  it("serializes current sessions and durable request ids", () => {
    expect(migration).toContain('UNIQUE INDEX "PlaySession_current_board_key"');
    expect(migration).toContain('WHERE "current" = TRUE');
    expect(migration).toContain(
      'UNIQUE INDEX "PlayRequestReceipt_scopeType_scopeId_requestId_key"',
    );
    expect(migration).toContain("9007199254740991");
  });

  it("keeps all authoritative play tables server-only", () => {
    for (const table of [
      "PlaySession",
      "PlayParticipant",
      "PlayRequestReceipt",
      "PlayOutbox",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`,
      );
      expect(migration).toContain(
        `REVOKE ALL ON TABLE public."${table}" FROM anon, authenticated`,
      );
    }
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("adds private Omok rooms without recreating legacy ticket indexes", () => {
    expect(omokPrivateRoomsMigration).toContain('CREATE TABLE "OmokLobbyRoom"');
    expect(omokPrivateRoomsMigration).toContain('ADD COLUMN "queueKind" TEXT');
    expect(omokPrivateRoomsMigration).toContain('ADD COLUMN "joinMode" TEXT');
    expect(omokPrivateRoomsMigration).toContain('ADD COLUMN "lobbyRoomId" TEXT');
    expect(omokPrivateRoomsMigration).not.toContain(
      'CREATE INDEX "OmokMatchTicket_matchBoardId_idx"',
    );
    expect(omokPrivateRoomsMigration).not.toContain(
      'CREATE INDEX "OmokMatchTicket_sessionId_idx"',
    );
  });

  it("keeps Omok private rooms server-only", () => {
    expect(omokPrivateRoomsMigration).toContain(
      'ALTER TABLE public."OmokLobbyRoom" ENABLE ROW LEVEL SECURITY',
    );
    expect(omokPrivateRoomsMigration).toContain(
      'REVOKE ALL ON TABLE public."OmokLobbyRoom" FROM anon, authenticated',
    );
  });
});
