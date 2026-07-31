-- Hand the NotificationOutbox wakeup off from the Vercel minute cron to
-- Supabase: an async pg_net Database Webhook on INSERT plus a low-frequency
-- pg_cron retry sweeper. Both call the same helper, which reads its endpoint
-- and shared secret from Vault at execution time.
--
-- This migration may be applied long before the Vault secrets exist. Every
-- path below is a safe no-op in that case: the helper returns NULL, the
-- statement-level trigger swallows transport errors, and application writes to
-- public."NotificationOutbox" are never blocked or rolled back by it.

-- Supabase installs pg_net into the `extensions` schema and pg_cron into the
-- `pg_cron` schema; its callable functions live in `net` and `cron`. Both
-- CREATE EXTENSION calls are no-ops when the extension is already present, and
-- are tolerated when the migration role may not create extensions (managed
-- projects where the dashboard enabled them, or local shadow databases).
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
    RAISE NOTICE 'pg_net not installable by this role; enable it in Supabase before cutover';
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
    RAISE NOTICE 'pg_cron not installable by this role; enable it in Supabase before cutover';
END;
$$;

-- Reuse the existing private schema: privileged, unexposed, never callable by
-- browser roles.
CREATE SCHEMA IF NOT EXISTS private;

-- Single wakeup helper. It sends a small reason payload only -- never outbox
-- rows, recipients, or push content -- because the Node consumer claims its own
-- bounded batch and remains the source of truth.
CREATE OR REPLACE FUNCTION private.request_notification_outbox_wakeup(
  wakeup_reason text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  worker_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  -- Vault is the only source for these values; nothing is hard-coded here.
  SELECT s."decrypted_secret" INTO worker_url
  FROM vault.decrypted_secrets s
  WHERE s."name" = 'notification_outbox_worker_url'
  LIMIT 1;

  SELECT s."decrypted_secret" INTO worker_secret
  FROM vault.decrypted_secrets s
  WHERE s."name" = 'notification_outbox_worker_secret'
  LIMIT 1;

  IF NULLIF(BTRIM(COALESCE(worker_url, '')), '') IS NULL
     OR NULLIF(BTRIM(COALESCE(worker_secret, '')), '') IS NULL THEN
    -- Not configured yet: the Vercel cron is still the poller. Stay silent so
    -- that a pre-cutover deploy cannot fail inserts or spam the log.
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := BTRIM(worker_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || BTRIM(worker_secret)
    ),
    body := jsonb_build_object(
      'reason', wakeup_reason,
      'source', 'notification_outbox'
    ),
    timeout_milliseconds := 5000
  ) INTO request_id;

  RETURN request_id;
EXCEPTION
  WHEN OTHERS THEN
    -- A missing extension, revoked grant, or queue failure must never roll back
    -- the caller's write. The outbox row stays pending and the next sweep (or
    -- the Vercel cron, while it is still scheduled) picks it up.
    RAISE WARNING 'notification outbox wakeup skipped: %', SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.request_notification_outbox_wakeup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_notification_outbox_wakeup(text) FROM anon, authenticated;

-- Statement-level trigger: one wakeup per INSERT statement, so a bulk insert of
-- N outbox rows coalesces into a single HTTP request instead of N.
CREATE OR REPLACE FUNCTION private.notify_notification_outbox_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.request_notification_outbox_wakeup('outbox_insert');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_notification_outbox_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_notification_outbox_insert() FROM anon, authenticated;

DROP TRIGGER IF EXISTS "notification_outbox_wakeup_insert" ON public."NotificationOutbox";
CREATE TRIGGER "notification_outbox_wakeup_insert"
AFTER INSERT ON public."NotificationOutbox"
FOR EACH STATEMENT
EXECUTE FUNCTION private.notify_notification_outbox_insert();

-- Retry sweeper. The INSERT webhook only covers new work; delayed retries and
-- expired 5-minute leases need a slow tick. It reuses the same helper and only
-- fires when work is actually due, so an idle queue sends no requests.
CREATE OR REPLACE FUNCTION private.sweep_notification_outbox_retries()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  due boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public."NotificationOutbox" o
    WHERE (
        o."status" = 'pending'
        AND (
          o."attempts" >= 8
          OR o."nextAttemptAt" <= CURRENT_TIMESTAMP
        )
      )
      OR (
        o."status" = 'processing'
        AND o."lockedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      )
  ) INTO due;

  IF NOT due THEN
    RETURN NULL;
  END IF;

  RETURN private.request_notification_outbox_wakeup('retry_sweep');
END;
$$;

REVOKE ALL ON FUNCTION private.sweep_notification_outbox_retries() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sweep_notification_outbox_retries() FROM anon, authenticated;

-- Idempotent job setup: unschedule any previous definition by name, then
-- schedule every 5 minutes. Skipped entirely when pg_cron is unavailable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'notification-outbox-retry-sweep'
    ) THEN
      PERFORM cron.unschedule('notification-outbox-retry-sweep');
    END IF;

    PERFORM cron.schedule(
      'notification-outbox-retry-sweep',
      '*/5 * * * *',
      $job$SELECT private.sweep_notification_outbox_retries();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; schedule notification-outbox-retry-sweep manually before cutover';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'cron.schedule not permitted for this role; schedule notification-outbox-retry-sweep manually';
END;
$$;

-- Cutover order lives in src/app/api/cron/notification-push/HANDOFF.md. The
-- Vercel minute cron entry stays scheduled until the production callback is
-- verified; only then is that one entry removed.
