-- Enable RLS for Prisma-managed public tables not covered by the share-board
-- RLS migration.
--
-- Supabase Security Advisor warns when tables in exposed schemas (public by
-- default) do not have row level security enabled. Most Aura tables are only
-- accessed through server-side Prisma routes, so this migration intentionally
-- enables RLS without broad anon/authenticated policies. That keeps direct
-- Data API access closed unless a table has an explicit policy.
--
-- The browser-facing shared-board Supabase path already enabled RLS and added
-- scoped grants/policies in 20260614_supabase_share_client_rls for:
-- Board, Section, Card, CardAttachment, CardAuthor, CardComment, CardLike.

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TeacherLlmKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TeacherSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PaymentEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CanvaConnectAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Classroom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ShowcaseEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BlobDeletionQueue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PreviewFetchCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssignmentSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SubmissionReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Quiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuizQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuizPlayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuizAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlantSpecies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlantStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomPlantAllow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentPlant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlantObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlantObservationImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssetAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BreakoutTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BreakoutAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BreakoutMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Parent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ParentOAuthAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ParentChildLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassInviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ParentInviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ParentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OAuthClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OAuthAuthCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OAuthAccessToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OAuthRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CanvaAppLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssessmentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssessmentQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssessmentSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AssessmentAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GradebookEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomRoleDef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardLayoutRoleGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomCurrency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StoreItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FixedDeposit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomRolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibeArcadeConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibeProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibeSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibeReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibePlaySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VibeQuotaLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DjPlayEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AgentMessage" ENABLE ROW LEVEL SECURITY;
