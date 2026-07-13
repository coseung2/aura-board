import { jsonPrivateNoStore } from "@/lib/http-cache";

export function GET() {
  return jsonPrivateNoStore(
    { error: "student_canva_connect_removed" },
    { status: 410 },
  );
}
