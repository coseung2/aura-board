CREATE TABLE "PasswordCredential" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "principalEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordCredential_username_key"
ON "PasswordCredential"("username");

CREATE UNIQUE INDEX "PasswordCredential_principalEmail_key"
ON "PasswordCredential"("principalEmail");

CREATE INDEX "PasswordCredential_principalEmail_idx"
ON "PasswordCredential"("principalEmail");

ALTER TABLE "PasswordCredential" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PasswordCredential" FROM anon, authenticated;
