import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function migration(name: string): string {
  return readFileSync(
    join(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    "utf8",
  );
}

const structure = migration("20260806231500_structure_student_push_notifications");
const schedule = migration("20260806232000_improve_student_push_notifications");

describe("structured student notification migrations", () => {
  it("adds exact titles and the reply and wallet notification kinds", () => {
    expect(structure).toContain('ADD COLUMN IF NOT EXISTS "title" TEXT');
    expect(structure).toContain("'reply'");
    expect(structure).toContain("'wallet'");
  });

  it("delays likes for five minutes and enqueues every wallet transaction", () => {
    expect(structure).toContain("TG_ARGV[0] = 'card_like'");
    expect(structure).toContain("INTERVAL '5 minutes'");
    expect(structure).toMatch(
      /AFTER INSERT ON public\."Transaction"\s+FOR EACH ROW\s+EXECUTE FUNCTION private\.enqueue_notification_outbox\('transaction'\)/,
    );
    expect(structure).not.toMatch(/AFTER INSERT ON public\."Transaction"[\s\S]*?WHEN \(/);
    expect(schedule).toContain('WHERE "eventType" = \'card_like\'');
  });

  it("schedules the morning task digest for 08:00 KST through Vault", () => {
    expect(schedule).toContain("attendance_reminder_worker_url");
    expect(schedule).toContain("notification_outbox_worker_secret");
    expect(schedule).toContain("'student-morning-tasks-08-kst'");
    expect(schedule).toContain("'0 23 * * *'");
    expect(schedule).toContain("private.request_attendance_reminder_wakeup()");
  });
});
