-- parent-redesign (2026-04-26)
-- 학부모 OAuth — Google + Kakao link join table.
-- (provider, providerAccountId) unique 로 같은 OAuth 계정 = 같은 Parent 강제.
-- email 매칭으로 기존 매직링크 학부모와 자동 link.

CREATE TABLE "ParentOAuthAccount" (
    "id"                TEXT         NOT NULL,
    "parentId"          TEXT         NOT NULL,
    "provider"          TEXT         NOT NULL,
    "providerAccountId" TEXT         NOT NULL,
    "email"             TEXT,
    "emailVerified"     BOOLEAN      NOT NULL DEFAULT false,
    "displayName"       TEXT,
    "profileImage"      TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentOAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParentOAuthAccount_provider_providerAccountId_key"
    ON "ParentOAuthAccount"("provider", "providerAccountId");
CREATE INDEX "ParentOAuthAccount_parentId_idx"
    ON "ParentOAuthAccount"("parentId");
CREATE INDEX "ParentOAuthAccount_email_idx"
    ON "ParentOAuthAccount"("email");

ALTER TABLE "ParentOAuthAccount"
    ADD CONSTRAINT "ParentOAuthAccount_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
