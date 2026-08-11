import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_APPLE_IDENTITY_TOKEN_LENGTH,
  verifyAppleIdentityToken,
} from "@/lib/parent-apple-auth";
import { upsertParentFromOAuth } from "@/lib/parent-oauth";
import { createParentSession } from "@/lib/parent-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const appleAuthRequestSchema = z.object({
  identityToken: z.string().trim().min(1).max(MAX_APPLE_IDENTITY_TOKEN_LENGTH),
  authorizationCode: z.string().trim().min(1).max(4_096).nullable().optional(),
  displayName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((value) => value || null),
});

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError("invalid_request", 400);
  }

  const input = appleAuthRequestSchema.safeParse(rawBody);
  if (!input.success) {
    return jsonError("invalid_request", 400);
  }

  let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    identity = await verifyAppleIdentityToken(input.data.identityToken);
  } catch {
    return jsonError("invalid_identity_token", 401);
  }

  let parent: { parentId: string; isNewParent: boolean };
  try {
    parent = await upsertParentFromOAuth("apple", {
      providerAccountId: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: input.data.displayName ?? null,
      profileImage: null,
    });
  } catch {
    return jsonError("internal_error", 500);
  }

  try {
    const session = await createParentSession({
      parentId: parent.parentId,
      userAgent: req.headers.get("user-agent") ?? null,
      ipHash: null,
    });

    return NextResponse.json(
      {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        isNewParent: parent.isNewParent,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("internal_error", 500);
  }
}
