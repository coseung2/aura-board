-- Enable RLS on public tables that were created without it.
--
-- The application accesses these tables exclusively through Prisma's
-- service role, which bypasses RLS, so enabling RLS does not affect app
-- traffic. anon/authenticated Data API access is intentionally denied
-- (no policies are created).

ALTER TABLE "public"."AssignmentSubmissionAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ClassroomRoleSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ContentReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HiddenContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HiddenContentAuthor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OmokMatchTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StudentAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StudentTitle" ENABLE ROW LEVEL SECURITY;
