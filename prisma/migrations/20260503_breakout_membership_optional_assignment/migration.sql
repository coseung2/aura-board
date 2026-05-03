-- Make BreakoutMembership.assignmentId optional for statistics board team assignments
ALTER TABLE "BreakoutMembership" ALTER COLUMN "assignmentId" DROP NOT NULL;
