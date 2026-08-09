import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  getRuntimeSupabasePublicKey,
  getRuntimeSupabaseUrl,
} from "@/lib/supabase/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const url = getRuntimeSupabaseUrl();
  const key = getRuntimeSupabasePublicKey();

  if (!url || !key) {
    return jsonPrivateNoStore({ configured: false });
  }

  return jsonPrivateNoStore({ configured: true, url, key });
}
