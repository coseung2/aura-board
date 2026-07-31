# Notification outbox handoff

The Vercel `notification-push` cron is the temporary dequeue poller. The
database triggers and `NotificationOutbox` remain the source of truth.

When a Supabase Database Webhook (on `NotificationOutbox` INSERT) or a managed
Edge Function is ready, have it invoke `GET /api/cron/notification-push` with
the same `Authorization: Bearer <CRON_SECRET>` contract. The endpoint atomically
claims a bounded batch, so duplicate webhook deliveries are safe and multiple
workers can overlap.

The exact handoff is complete after that callback is verified in production:
remove only the `/api/cron/notification-push` entry from `vercel.json`. Keep the
route, trigger function, outbox table, leases, and recipient event keys. The
daily attendance schedule remains separate and must not be removed.
