-- Structure student notifications for morning digests, reply targeting,
-- grouped likes, and complete wallet activity.

ALTER TABLE public."StudentNotification"
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public."StudentNotification"
  DROP CONSTRAINT IF EXISTS "StudentNotification_kind_check";
ALTER TABLE public."StudentNotification"
  ADD CONSTRAINT "StudentNotification_kind_check"
  CHECK ("kind" IN (
    'like', 'comment', 'reply', 'wallet', 'reward', 'refund',
    'attendance', 'assignment'
  ));

-- Likes are intentionally delayed for five minutes so the worker can query the
-- whole card/time bucket and send one digest instead of one push per click.
CREATE OR REPLACE FUNCTION private.enqueue_notification_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  due_at timestamptz;
BEGIN
  due_at := CASE
    WHEN TG_ARGV[0] = 'card_like' THEN CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    ELSE CURRENT_TIMESTAMP
  END;

  INSERT INTO public."NotificationOutbox" (
    "id", "eventType", "sourceId", "status", "attempts",
    "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid()::text, TG_ARGV[0], NEW."id", 'pending', 0,
    due_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("eventType", "sourceId") DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_notification_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_notification_outbox() FROM anon, authenticated;

-- Every authoritative balance mutation is relevant to the student. The worker
-- derives whether the transaction is an incoming or outgoing movement.
DROP TRIGGER IF EXISTS "notification_outbox_transaction_insert" ON public."Transaction";
CREATE TRIGGER "notification_outbox_transaction_insert"
AFTER INSERT ON public."Transaction"
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_notification_outbox('transaction');

-- Oracle is not required for the 08:00 KST digest. Supabase pg_cron wakes the
-- authenticated Vercel route directly. Missing Vault values remain a safe no-op.
CREATE OR REPLACE FUNCTION private.request_student_morning_digest()
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
  WHERE s."name" = 'student_morning_worker_url'
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
      'reason', 'morning_tasks',
      'source', 'student_notification_schedule'
    ),
    timeout_milliseconds := 15000
  ) INTO request_id;

  RETURN request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'student morning digest wakeup skipped: %', SQLERRM;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.request_student_morning_digest() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.request_student_morning_digest() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'student-morning-digest') THEN
      PERFORM cron.unschedule('student-morning-digest');
    END IF;
    PERFORM cron.schedule(
      'student-morning-digest',
      '0 23 * * *',
      $job$SELECT private.request_student_morning_digest();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; schedule student-morning-digest manually';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'cron.schedule not permitted for student-morning-digest';
END;
$$;
