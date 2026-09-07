/** Compatibility endpoint: share writes use the canonical card authorization
 * and post-commit delivery path. A display name is never ownership proof. */
import { NextResponse } from "next/server";
import { PATCH as patchCard, DELETE as deleteCard } from "@/app/api/cards/[id]/route";

type Context = { params: Promise<{ cardId: string }> };

async function forward(req: Request, context: Context, method: "PATCH" | "DELETE") {
  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_input");
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const shareToken = typeof body.shareToken === "string" ? body.shareToken.trim() : req.headers.get("x-share-token")?.trim();
  const guestId = req.headers.get("x-share-guest-id")?.trim() || (typeof body.guestId === "string" ? body.guestId.trim() : "");
  if (!shareToken) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!guestId) return NextResponse.json({ error: "share_guest_required" }, { status: 403 });

  const { cardId } = await context.params;
  const headers = new Headers(req.headers);
  headers.set("x-share-token", shareToken);
  headers.set("x-share-guest-id", guestId);
  headers.set("content-type", "application/json");
  const forwarded = new Request(req.url, {
    method,
    headers,
    ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
  });
  const handler = method === "PATCH" ? patchCard : deleteCard;
  return handler(forwarded, { params: Promise.resolve({ id: cardId }) });
}

export function PATCH(req: Request, context: Context) { return forward(req, context, "PATCH"); }
export function DELETE(req: Request, context: Context) { return forward(req, context, "DELETE"); }
