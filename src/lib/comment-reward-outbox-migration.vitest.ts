import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260809161200_add_comment_reward_outbox_payload/migration.sql",
  ),
  "utf8",
);

describe("comment reward outbox payload migration", () => {
  it("atomically snapshots notification and reward events from one comment insert", () => {
    expect(migration).toContain('ADD COLUMN "payload" JSONB');
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain(
      'LOCK TABLE public."CardComment" IN SHARE ROW EXCLUSIVE MODE',
    );
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain('CREATE TABLE public."CommentRewardClaim"');
    expect(migration).toContain('"CommentRewardClaim_studentId_normalizedHash_key"');
    expect(migration).toContain("SELECT DISTINCT ON (\"studentId\", \"normalizedHash\")");
    expect(migration).toContain("FROM public.\"CardComment\" c");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.enqueue_card_comment_outbox()");
    expect(migration).toContain("'card_comment'");
    expect(migration).toContain("'comment_reward'");
    expect(migration).toContain("'normalizedContent'");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("ON CONFLICT (\"studentId\", \"normalizedHash\") DO NOTHING");
    expect(migration).toContain("WHERE reward_claim_id IS NOT NULL");
    expect(migration).toContain("'occurredAt', to_char(");
    expect(migration).toContain("'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'");
    expect(migration).toContain('ON CONFLICT ("eventType", "sourceId") DO NOTHING');
    expect(migration).toContain('AFTER INSERT ON public."CardComment"');
  });

  it("keeps the trigger function outside exposed schemas and non-callable by browsers", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.enqueue_card_comment_outbox() FROM PUBLIC",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.enqueue_card_comment_outbox() FROM anon, authenticated",
    );
    expect(migration).toContain(
      'ALTER TABLE public."CommentRewardClaim" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public."CommentRewardClaim" FROM anon, authenticated',
    );
  });
});
