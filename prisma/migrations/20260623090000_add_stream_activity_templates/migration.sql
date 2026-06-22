ALTER TABLE "Section" ADD COLUMN "activityTemplate" TEXT;

CREATE TABLE "SectionMapPlace" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "address" TEXT,
    "providerPlaceId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdByStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionMapPlace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SectionMapRoute" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "orderedPlaceIds" JSONB NOT NULL,
    "travelMode" TEXT NOT NULL DEFAULT 'walking',
    "lineColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionMapRoute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SectionMapPlace_sectionId_idx" ON "SectionMapPlace"("sectionId");
CREATE INDEX "SectionMapPlace_createdByStudentId_idx" ON "SectionMapPlace"("createdByStudentId");
CREATE UNIQUE INDEX "SectionMapRoute_sectionId_key" ON "SectionMapRoute"("sectionId");

ALTER TABLE "SectionMapPlace" ADD CONSTRAINT "SectionMapPlace_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionMapRoute" ADD CONSTRAINT "SectionMapRoute_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
