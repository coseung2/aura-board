-- Move the student morning attendance digest to 07:50 KST (22:50 UTC).
-- Keep the Oracle cron and any legacy pg_cron deployment from sending the
-- morning reminder at the old 08:00 KST time or sending it twice.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'student-morning-digest') THEN
      PERFORM cron.unschedule('student-morning-digest');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'student-morning-tasks-08-kst') THEN
      PERFORM cron.unschedule('student-morning-tasks-08-kst');
    END IF;

    PERFORM cron.schedule(
      'student-morning-tasks-0750-kst',
      '50 22 * * *',
      $job$SELECT private.request_attendance_reminder_wakeup();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; student-morning-tasks-0750-kst was not scheduled';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'cron.schedule not permitted for student-morning-tasks-0750-kst';
END;
$$;
