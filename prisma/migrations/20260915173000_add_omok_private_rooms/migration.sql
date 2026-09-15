ALTER TABLE "OmokMatchTicket"
ADD COLUMN "queueKind" TEXT NOT NULL DEFAULT 'random',
ADD COLUMN "joinMode" TEXT NOT NULL DEFAULT 'player',
ADD COLUMN "lobbyRoomId" TEXT;

CREATE INDEX "OmokMatchTicket_lobbyRoomId_idx"
ON "OmokMatchTicket"("lobbyRoomId");

CREATE TABLE "OmokLobbyRoom" (
  "id" TEXT NOT NULL,
  "lobbyBoardId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "hostStudentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "matchBoardId" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OmokLobbyRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OmokLobbyRoom_lobbyBoardId_classroomId_status_createdAt_idx"
ON "OmokLobbyRoom"("lobbyBoardId", "classroomId", "status", "createdAt");

CREATE INDEX "OmokLobbyRoom_hostStudentId_status_idx"
ON "OmokLobbyRoom"("hostStudentId", "status");

CREATE INDEX "OmokLobbyRoom_matchBoardId_idx" ON "OmokLobbyRoom"("matchBoardId");
CREATE INDEX "OmokLobbyRoom_sessionId_idx" ON "OmokLobbyRoom"("sessionId");

-- Match the existing server-only Omok ticket boundary. Browser roles receive
-- no direct policies; all matchmaking writes go through the authenticated app.
ALTER TABLE public."OmokLobbyRoom" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."OmokLobbyRoom" FROM anon, authenticated;

-- Oracle production publishes the public schema to the warm DR database.
-- The table is included by the schema publication automatically, but the
-- bounded replication role still needs SELECT on each newly-created table.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'aura_board_dr_replication'
  ) THEN
    GRANT SELECT ON TABLE public."OmokLobbyRoom" TO aura_board_dr_replication;
  END IF;
END
$migration$;
