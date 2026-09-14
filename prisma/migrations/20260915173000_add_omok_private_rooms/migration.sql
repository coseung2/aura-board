ALTER TABLE "OmokMatchTicket"
ADD COLUMN "queueKind" TEXT NOT NULL DEFAULT 'random',
ADD COLUMN "joinMode" TEXT NOT NULL DEFAULT 'player',
ADD COLUMN "lobbyRoomId" TEXT;

CREATE INDEX "OmokMatchTicket_lobbyRoomId_idx"
ON "OmokMatchTicket"("lobbyRoomId");

CREATE INDEX "OmokMatchTicket_matchBoardId_idx"
ON "OmokMatchTicket"("matchBoardId");

CREATE INDEX "OmokMatchTicket_sessionId_idx"
ON "OmokMatchTicket"("sessionId");

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
