export async function GET() {
  return Response.json(
    {
      error: "speed_game_stream_deprecated",
      transport: "supabase_broadcast",
      snapshot: "/api/speed-game/games/{gameId}",
    },
    {
      status: 410,
      headers: { Deprecation: "true", "Cache-Control": "private, no-store" },
    },
  );
}
