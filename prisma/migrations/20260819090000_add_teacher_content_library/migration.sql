-- CreateTable
CREATE TABLE "TeacherLibraryCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherLibraryCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherLibraryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "assetUrl" TEXT,
    "previewUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "canvaDesignId" TEXT,
    "canvaViewUrl" TEXT,
    "pageCount" INTEGER,
    "sourceBoardId" TEXT,
    "sourceSectionId" TEXT,
    "sourceCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherLibraryCollection_userId_name_key" ON "TeacherLibraryCollection"("userId", "name");
CREATE INDEX "TeacherLibraryCollection_userId_updatedAt_idx" ON "TeacherLibraryCollection"("userId", "updatedAt");
CREATE UNIQUE INDEX "TeacherLibraryItem_userId_sourceKey_key" ON "TeacherLibraryItem"("userId", "sourceKey");
CREATE INDEX "TeacherLibraryItem_userId_createdAt_idx" ON "TeacherLibraryItem"("userId", "createdAt");
CREATE INDEX "TeacherLibraryItem_collectionId_createdAt_idx" ON "TeacherLibraryItem"("collectionId", "createdAt");
CREATE INDEX "TeacherLibraryItem_canvaDesignId_idx" ON "TeacherLibraryItem"("canvaDesignId");
CREATE INDEX "TeacherLibraryItem_sourceSectionId_idx" ON "TeacherLibraryItem"("sourceSectionId");

ALTER TABLE "TeacherLibraryCollection" ADD CONSTRAINT "TeacherLibraryCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherLibraryItem" ADD CONSTRAINT "TeacherLibraryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherLibraryItem" ADD CONSTRAINT "TeacherLibraryItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "TeacherLibraryCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
