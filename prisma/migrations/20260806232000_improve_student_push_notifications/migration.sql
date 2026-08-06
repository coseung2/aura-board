-- Finish the structured student notification rollout by adjusting already
-- queued likes and moving the 08:00 KST morning reminder off Oracle.
--
-- The preceding 20260806231500 migration owns the notification title column,
-- kind constraint, delayed enqueue function, and all-transaction trigger.

-- Likes that were already waiting when the delayed enqueue function was
-- installed should obey the same five-minute quiet window.
UPDATE public."NotificationOutbox"
SET "nextAttemptAt" = GREATEST(
      "nextAttemptAt",
      "createdAt" + INTERVAL '5 minutes'
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "eventType" = 'card_like'
  AND "status" = 'pending';

-- The URL and shared bearer secret are supplied through Supabase Vault. Missing
-- values remain a safe no-op so this can deploy before the operator adds them.
CREATE OR REPLACE FUNCTION private.request_attendance_reminder_wakeup()
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
  SELECT s."decrypted_secret" INTO worker_url
  FROM vault.decrypted_secrets s
  WHERE s."name" = 'attendance_reminder_worker_url'
  LIMIT 1;

  SELECT s."decrypted_secret" INTO worker_secret
  FROM vault.decrypted_secrets s
  WHERE s."name" = 'notification_outbox_worker_secret'
  LIMIT 1;

  IF NULLIF(BTRIM(COALESCE(worker_url, '')), '') IS NULL
     OR NULLIF(BTRIM(COALESCE(worker_secret, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := BTRIM(worker_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || BTRIM(worker_secret)
    ),
    body := jsonb_build_object(
      'reason', '08:00_kst_morning_tasks',
      'source', 'student_notification_schedule'
    ),
    timeout_milliseconds := 30000
  ) INTO request_id;

  RETURN request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'attendance reminder wakeup skipped: %', SQLERRM;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.request_attendance_reminder_wakeup() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_attendance_reminder_wakeup() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'student-morning-tasks-08-kst'
    ) THEN
      PERFORM cron.unschedule('student-morning-tasks-08-kst');
    END IF;

    -- 23:00 UTC is 08:00 the next calendar day in Asia/Seoul.
    PERFORM cron.schedule(
      'student-morning-tasks-08-kst',
      '0 23 * * *',
      $job$SELECT private.request_attendance_reminder_wakeup();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; student-morning-tasks-08-kst was not scheduled';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'cron.schedule not permitted for student-morning-tasks-08-kst';
END;
$$;
