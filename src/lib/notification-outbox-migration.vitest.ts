import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260731130000_durable_notification_outbox",
  "migration.sql",
), "utf8");

describe("durable notification migration", () => {
  it("installs one compact INSERT trigger for every non-attendance source", () => {
    expect(migration).toContain('AFTER INSERT ON public."CardLike"');
    expect(migration).toContain('AFTER INSERT ON public."CardComment"');
    expect(migration).toContain('AFTER INSERT ON public."Transaction"');
    expect(migration).toContain('AFTER INSERT ON public."ParentChildLink"');
    expect(migration).toContain('AFTER INSERT ON public."AssignmentSlot"');
    expect(migration).toContain("NEW.\"sourceType\" = 'slime_item_refund'");
    expect(migration).toContain("LIMIT 5000");
  });

  it("enforces recipient/source idempotency and server-only RLS", () => {
    expect(migration).toContain('UNIQUE INDEX "NotificationOutbox_eventType_sourceId_key"');
    expect(migration).toContain('UNIQUE INDEX "StudentNotification_studentId_eventKey_key"');
    expect(migration).toContain('ALTER TABLE public."NotificationOutbox" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE public."StudentNotification" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.enqueue_notification_outbox()");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.enqueue_notification_outbox() FROM PUBLIC");
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("documents the polling-to-webhook handoff without adding an Edge runtime", () => {
    expect(migration).toContain("At handoff, remove only the notification-push cron schedule");
    expect(migration).not.toMatch(/Deno\.serve|supabase\/functions/i);
  });
});
