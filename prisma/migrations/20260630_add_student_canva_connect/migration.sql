-- Student-owned Canva Connect tokens for wallet card design creation.
CREATE TABLE "CanvaStudentConnectAccount" (
    "studentId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pkceVerifier" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvaStudentConnectAccount_pkey" PRIMARY KEY ("studentId")
);

ALTER TABLE "CanvaStudentConnectAccount" ADD CONSTRAINT "CanvaStudentConnectAccount_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
