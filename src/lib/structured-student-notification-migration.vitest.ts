import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function readMigration(name: string): string {
  return readFileSync(
    join(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    "utf8",
  );
}

const structure = readMigration(
  "20260806231500_structure_student_push_notifications",
);
const schedule = readMigration(
  "20260806232000_improve_student_push_notifications",
);
const morning0750 = readMigration(
  "20260901100000_move_student_morning_digest_to_0750_kst",
);

describe("structured student notification migrations", () => {
  it("adds durable titles and the reply and wallet kinds", () => {
    expect(structure).toContain('ADD COLUMN IF NOT EXISTS "title" TEXT');
    expect(structure).toContain("'reply'");
    expect(structure).toContain("'wallet'");
  });

  it("delays card likes for a five-minute digest window", () => {
    expect(structure).toContain("TG_ARGV[0] = 'card_like'");
    expect(structure).toContain("INTERVAL '5 minutes'");
    expect(schedule).toContain('WHERE "eventType" = \'card_like\'');
  });

  it("enqueues every authoritative transaction without a source-type filter", () => {
    expect(structure).toMatch(
      /CREATE TRIGGER "notification_outbox_transaction_insert"[\s\S]*AFTER INSERT ON public\."Transaction"[\s\S]*FOR EACH ROW[\s\S]*enqueue_notification_outbox\('transaction'\)/,
    );
    expect(structure).not.toContain('NEW."sourceType"');
  });

  it("schedules the morning digest for 08:00 KST without Oracle", () => {
    expect(schedule).toContain("'student-morning-tasks-08-kst'");
    expect(schedule).toContain("'0 23 * * *'");
    expect(schedule).toContain("attendance_reminder_worker_url");
    expect(schedule).toContain("notification_outbox_worker_secret");
  });

  it("moves the canonical morning digest to 07:50 KST and removes duplicates", () => {
    expect(morning0750).toContain("student-morning-tasks-0750-kst");
    expect(morning0750).toContain("'50 22 * * *'");
    expect(morning0750).toContain("cron.unschedule('student-morning-digest')");
    expect(morning0750).toContain("cron.unschedule('student-morning-tasks-08-kst')");
  });
});
