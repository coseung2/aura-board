export async function GET() {
  return Response.json(
    {
      error: "board_stream_deprecated",
      transport: "supabase_broadcast",
      snapshot: "/api/boards/{id}/snapshot",
    },
    {
      status: 410,
      headers: { Deprecation: "true", "Cache-Control": "private, no-store" },
    },
  );
}
