import "server-only";
import { Resend } from "resend";

// parent-class-invite-v2 — parent email dispatcher.
//
// Two code paths preserved:
//   1. sendParentDigest()  — PV-10 weekly digest (existing, no behavioural change).
//   2. dispatchParentNotification() — v2 transactional templates (9 types).
//
// All real sends are gated on PARENT_EMAIL_ENABLED === "true". When disabled
// (dev, preview, or prod before RESEND_API_KEY is provisioned) we log the
// payload and return ok so business logic keeps flowing.
//
// DEFERRED — external infra:
//   • RESEND_API_KEY
//   • PARENT_EMAIL_FROM   (validated Resend sender, SPF/DKIM required)
// See tasks/2026-04-15-parent-class-invite-v2/phase3_amendment_v2/blockers_for_phase7.md §1.

export interface DigestEmailInput {
  to: string;
  parentName: string;
  subject: string;
  children: Array<{
    studentName: string;
    plantObservations: number;
    breakoutJoined: number;
    eventSignups: number;
  }>;
  weekStart: Date;
  weekEnd: Date;
}

export async function sendParentDigest(input: DigestEmailInput): Promise<{ ok: boolean }> {
  const enabled = process.env.PARENT_EMAIL_ENABLED === "true";
  if (!enabled) {
    console.log("[parent-email:stub]", {
      to: input.to,
      subject: input.subject,
      parentName: input.parentName,
      childCount: input.children.length,
      weekStart: input.weekStart.toISOString(),
      weekEnd: input.weekEnd.toISOString(),
    });
    return { ok: true };
  }
  console.warn("[parent-email] PARENT_EMAIL_ENABLED=true but digest wiring is deferred — no-op.");
  return { ok: true };
}

// ── v2 transactional templates ─────────────────────────────────────────
// 9 templates:
//   parent-rejected-{wrong-child|not-parent|other}
//   parent-auto-expired
//   parent-code-rotated
//   parent-classroom-deleted
//   teacher-reminder-d3
//   teacher-warning-d6
//   teacher-summary-d7

export type TemplateId =
  | "parent-rejected-wrong-child"
  | "parent-rejected-not-parent"
  | "parent-rejected-other"
  | "parent-auto-expired"
  | "parent-code-rotated"
  | "parent-classroom-deleted"
  | "teacher-reminder-d3"
  | "teacher-warning-d6"
  | "teacher-summary-d7";

export interface NotificationPayload {
  to: string;
  subject: string;
  template: TemplateId;
  /** JSON payload rendered into the React template. Shape is per-template. */
  props: Record<string, unknown>;
  /** Optional idempotency key — for Cron D+3/D+6 reminders. Same key in the same process will be skipped. */
  idempotencyKey?: string;
}

const sentIdempotencyKeys = new Set<string>();

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getFrom(): string {
  return process.env.PARENT_EMAIL_FROM ?? "no-reply@aura-board.app";
}

/**
 * Send a v2 transactional email. Returns `{ ok: true }` in dev/stub so that
 * business logic (cron, cascade) doesn't block on missing infra. The stub
 * path logs the payload so QA can inspect it in Vercel logs.
 */
export async function dispatchParentNotification(
  payload: NotificationPayload
): Promise<{ ok: boolean; stub?: boolean }> {
  if (payload.idempotencyKey) {
    if (sentIdempotencyKeys.has(payload.idempotencyKey)) {
      return { ok: true, stub: true };
    }
    sentIdempotencyKeys.add(payload.idempotencyKey);
  }

  const enabled = process.env.PARENT_EMAIL_ENABLED === "true";
  if (!enabled) {
    console.log("[parent-email:v2:stub]", {
      to: payload.to,
      subject: payload.subject,
      template: payload.template,
      idempotencyKey: payload.idempotencyKey ?? null,
    });
    return { ok: true, stub: true };
  }

  const resend = getResend();
  if (!resend) {
    console.warn("[parent-email:v2] RESEND_API_KEY missing — logging and returning ok.");
    return { ok: true, stub: true };
  }

  try {
    // Template modules render React components to HTML at send time. We use a
    // thin switch (not a registry) so tree-shaking keeps the bundle small.
    const { render } = await import("@react-email/components");
    const html = await renderTemplate(payload.template, payload.props, render);

    await resend.emails.send({
      from: getFrom(),
      to: payload.to,
      subject: payload.subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[parent-email:v2] send failed", payload.template, e);
    return { ok: false };
  }
}

// Dispatch a Cron reminder ONCE per (key, process). Use for teacher D+3/D+6/D+7
// in /api/cron/expire-pending-links.
export async function dispatchOnce(
  key: string,
  payload: Omit<NotificationPayload, "idempotencyKey">
): Promise<{ ok: boolean }> {
  return dispatchParentNotification({ ...payload, idempotencyKey: key });
}

type RenderFn = (
  node: Parameters<(typeof import("@react-email/components"))["render"]>[0]
) => Promise<string>;

// Runtime-dispatched render. Callers build the prop shape per template id;
// we forward an unknown map through a cast because TS cannot cross-correlate
// `id` → `Mod.default`'s prop type here. Each template validates its props
// at the call site (see /api/*/route.ts). Keep in sync with TemplateId.
async function renderTemplate(
  id: TemplateId,
  props: Record<string, unknown>,
  render: RenderFn
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Any = (C: any) => <C {...(props as any)} />;
  switch (id) {
    case "parent-rejected-wrong-child":
      return render(Any((await import("@/emails/parent-rejected-wrong-child")).default));
    case "parent-rejected-not-parent":
      return render(Any((await import("@/emails/parent-rejected-not-parent")).default));
    case "parent-rejected-other":
      return render(Any((await import("@/emails/parent-rejected-other")).default));
    case "parent-auto-expired":
      return render(Any((await import("@/emails/parent-auto-expired")).default));
    case "parent-code-rotated":
      return render(Any((await import("@/emails/parent-code-rotated")).default));
    case "parent-classroom-deleted":
      return render(Any((await import("@/emails/parent-classroom-deleted")).default));
    case "teacher-reminder-d3":
      return render(Any((await import("@/emails/teacher-reminder-d3")).default));
    case "teacher-warning-d6":
      return render(Any((await import("@/emails/teacher-warning-d6")).default));
    case "teacher-summary-d7":
      return render(Any((await import("@/emails/teacher-summary-d7")).default));
  }
}

// Test-only hook.
export function _resetIdempotencyKeysForTests(): void {
  sentIdempotencyKeys.clear();
}
