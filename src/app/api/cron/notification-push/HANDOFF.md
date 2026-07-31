# Notification outbox handoff

The wakeup for `public."NotificationOutbox"` moves from the Vercel minute cron
to Supabase. This route stays the only consumer: it atomically claims a bounded
batch under a 5-minute lease, so duplicate or overlapping wakeups are safe.

The database side is installed by
`prisma/migrations/20260731150000_notification_outbox_supabase_wakeup/migration.sql`:

- `private.request_notification_outbox_wakeup(text)` reads
  `notification_outbox_worker_url` and `notification_outbox_worker_secret` from
  `vault.decrypted_secrets` and async-POSTs a small reason payload with
  `extensions.pg_net` (`net.http_post`, 5s timeout). No outbox row data is sent.
- Trigger `notification_outbox_wakeup_insert` is `AFTER INSERT ... FOR EACH
  STATEMENT`, so a bulk insert of N rows produces one request, not N.
- pg_cron job `notification-outbox-retry-sweep` runs `*/5 * * * *` and calls the
  same helper only when retry-due or lease-expired work exists.

Until both Vault secrets exist the helper returns `NULL` and sends nothing, and
any transport error is downgraded to a warning. Applying this migration can
never block or roll back a write to the outbox, and the Vercel cron keeps
draining the queue in the meantime.

## Prerequisite: the route must accept POST

The helper POSTs, so `route.ts` must export `POST` alongside `GET`, sharing the
same `isAuthorizedCronRequest` check and `consumeNotificationOutbox` call. That
export exists; confirm it is actually live in the deployed production build
before creating the Vault secrets, otherwise every wakeup returns `405`.

If the endpoint is ever narrowed back to GET-only, switch the helper to
`net.http_get` (headers only, no body) and drop the payload assertions from
`src/lib/notification-outbox-wakeup-migration.vitest.ts`.

## Configuration

1. Enable `pg_net` and `pg_cron` in Supabase (Database -> Extensions). The
   migration attempts both and only emits a notice if the role lacks the
   privilege.
2. Create the two Vault secrets (Project Settings -> Vault) with exactly these
   names:
   - `notification_outbox_worker_url` = the full production HTTPS URL of
     `/api/cron/notification-push`.
   - `notification_outbox_worker_secret` = the same value as the `CRON_SECRET`
     env var on Vercel production.
3. Confirm the scheduled job exists:
   `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'notification-outbox-retry-sweep';`

Rotating `CRON_SECRET` means updating the Vault secret too; update Vault first,
then Vercel, to avoid a window where every wakeup is rejected with `401`.

## Cutover order

1. Apply the migration. The Vercel cron entry in `vercel.json` stays untouched.
2. Add the `POST` handler (see prerequisite) and deploy.
3. Create both Vault secrets. Wakeups begin immediately on the next insert.
4. Verify in production (below).
5. Only after verification, remove **only** the `/api/cron/notification-push`
   entry from the `crons` array in `vercel.json`. Keep the route, the enqueue
   triggers, the outbox table, the leases, and the event keys. The
   `attendance-reminder` and other schedules are unrelated and must stay.

## Verification

Run these against production after step 3:

- Manual helper call:
  `SELECT private.request_notification_outbox_wakeup('manual_check');`
  A non-null `bigint` means the request was queued. `NULL` means a secret is
  missing or malformed.
- Delivery result:
  `SELECT status_code, error_msg, created FROM net._http_response ORDER BY created DESC LIMIT 5;`
  Expect `200`. `401` means the secret mismatches `CRON_SECRET`; `405` means the
  `POST` handler is not deployed yet.
- End-to-end: trigger a real like or comment, then confirm the outbox row
  reaches `status = 'done'` within seconds instead of waiting for the next
  minute tick:
  `SELECT "status", "attempts", "processedAt" FROM public."NotificationOutbox" ORDER BY "createdAt" DESC LIMIT 5;`
- Coalescing: insert several rows in one statement and confirm exactly one new
  row appears in `net._http_response`.
- Sweeper: with the Vercel cron already removed, leave a row with a past
  `nextAttemptAt` and confirm it is picked up within 5 minutes.

Watch for a backlog of `pending` rows with rising `attempts`, which indicates
wakeups are firing but the worker is failing, and for `dead` rows, which are
terminal after 8 attempts and are not retried by the sweeper.

## Rollback

Fastest, no-deploy rollback: delete or rename the two Vault secrets. The helper
immediately no-ops and pushes stop being wakened by the database.

If the Vercel cron entry was already removed, restore it (`* * * * *`) and
redeploy to resume polling; the outbox is durable, so queued rows are drained
once either path is live.

To remove the database side entirely:

```sql
DROP TRIGGER IF EXISTS "notification_outbox_wakeup_insert" ON public."NotificationOutbox";
SELECT cron.unschedule('notification-outbox-retry-sweep');
DROP FUNCTION IF EXISTS private.notify_notification_outbox_insert();
DROP FUNCTION IF EXISTS private.sweep_notification_outbox_retries();
DROP FUNCTION IF EXISTS private.request_notification_outbox_wakeup(text);
```

This leaves the enqueue triggers, the outbox table, and the consumer intact.
