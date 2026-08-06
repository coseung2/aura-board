CREATE TABLE "OmokMatchTicket" (
    "id" TEXT NOT NULL,
    "lobbyBoardId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "opponentStudentId" TEXT,
    "matchBoardId" TEXT,
    "sessionId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OmokMatchTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OmokMatchTicket_lobbyBoardId_studentId_key"
ON "OmokMatchTicket"("lobbyBoardId", "studentId");
CREATE INDEX "OmokMatchTicket_lobbyBoardId_status_requestedAt_idx"
ON "OmokMatchTicket"("lobbyBoardId", "status", "requestedAt");
CREATE INDEX "OmokMatchTicket_matchBoardId_idx" ON "OmokMatchTicket"("matchBoardId");
CREATE INDEX "OmokMatchTicket_sessionId_idx" ON "OmokMatchTicket"("sessionId");
