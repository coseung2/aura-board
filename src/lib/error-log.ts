import "server-only";
import { db } from "./db";

type ErrorLogInput = {
  userId?: string | null;
  userEmail?: string | null;
  feature: string;
  path?: string | null;
  status?: number | null;
  error: unknown;
  metadata?: Record<string, unknown>;
};

export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const error =
      input.error instanceof Error
        ? input.error
        : new Error(typeof input.error === "string" ? input.error : "Unknown error");

    await db.errorLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        feature: input.feature,
        path: input.path ?? null,
        status: input.status ?? null,
        message: error.message || "Unknown error",
        stack: trimStack(error.stack),
        metadata: (input.metadata as never) ?? null,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[error-log] failed:", (err as Error).message);
    }
  }
}

function trimStack(stack: string | undefined): string | null {
  if (!stack) return null;
  return stack.length > 8000 ? `${stack.slice(0, 8000)}...` : stack;
}
