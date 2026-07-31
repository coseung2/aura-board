import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260731150000_notification_outbox_supabase_wakeup",
    "migration.sql",
  ),
  "utf8",
);

describe("NotificationOutbox Supabase wakeup migration", () => {
  it("posts asynchronously via pg_net from a statement-level INSERT trigger", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions");
    expect(migration).toContain("net.http_post(");
    expect(migration).toContain('AFTER INSERT ON public."NotificationOutbox"');
    expect(migration).toContain("FOR EACH STATEMENT");
    expect(migration).toContain(
      "EXECUTE FUNCTION private.notify_notification_outbox_insert()",
    );
    // Statement-level coalescing only works if the trigger never runs per row.
    expect(migration).not.toMatch(
      /AFTER INSERT ON public\."NotificationOutbox"\s*\r?\nFOR EACH ROW/,
    );
  });

  it("reads both endpoint and secret from Vault and hard-codes neither", () => {
    expect(migration).toContain("FROM vault.decrypted_secrets");
    expect(migration).toContain("'notification_outbox_worker_url'");
    expect(migration).toContain("'notification_outbox_worker_secret'");
    expect(migration).toContain("'Authorization', 'Bearer ' || BTRIM(worker_secret)");
    expect(migration).not.toMatch(/https:\/\/[a-z0-9.-]*\/api\/cron/i);
  });

  it("no-ops safely when secrets are absent so writes are never blocked", () => {
    expect(migration).toContain(
      "IF NULLIF(BTRIM(COALESCE(worker_url, '')), '') IS NULL",
    );
    expect(migration).toContain(
      "OR NULLIF(BTRIM(COALESCE(worker_secret, '')), '') IS NULL THEN",
    );
    expect(migration).toContain("WHEN OTHERS THEN");
    expect(migration).toContain("RAISE WARNING 'notification outbox wakeup skipped: %'");
    expect(migration).not.toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("sends only a reason payload, never outbox row data", () => {
    expect(migration).toContain("'reason', wakeup_reason");
    expect(migration).toContain("'source', 'notification_outbox'");
    expect(migration).not.toMatch(/body\s*:=[^;]*\bNEW\b/);
    expect(migration).not.toMatch(/row_to_json|to_jsonb\s*\(\s*NEW/i);
  });

  it("schedules an idempotent 5-minute retry sweeper on the same helper", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(migration).toContain(
      "PERFORM cron.unschedule('notification-outbox-retry-sweep')",
    );
    expect(migration).toContain("'notification-outbox-retry-sweep',");
    expect(migration).toContain("'*/5 * * * *'");
    expect(migration).toContain(
      "RETURN private.request_notification_outbox_wakeup('retry_sweep')",
    );
    expect(migration).toContain("INTERVAL '5 minutes'");
  });

  it("wakes terminal candidates so an abandoned final lease can become dead", () => {
    expect(migration).toContain('o."attempts" >= 8');
    expect(migration).toMatch(
      /o\."status" = 'processing'[\s\S]*o\."lockedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'/,
    );
  });

  it("keeps privileged helpers in the private schema with least privilege", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS private");
    for (const fn of [
      "private.request_notification_outbox_wakeup(text)",
      "private.notify_notification_outbox_insert()",
      "private.sweep_notification_outbox_retries()",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon, authenticated`);
    }
    expect(migration.match(/SET search_path = ''/g)?.length).toBe(3);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE[^;]*(anon|authenticated)/i);
    expect(migration).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION\s+public\./i);
  });

  it("does not touch the outbox contract owned by the consumer", () => {
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+public\."NotificationOutbox"/i);
    expect(migration).not.toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+"notification_outbox_card/i);
    expect(migration).not.toMatch(/Deno\.serve|supabase\/functions/i);
  });
});
