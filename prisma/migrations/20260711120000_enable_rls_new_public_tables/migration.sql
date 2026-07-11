-- Close direct Data API access for public tables added after
-- 20260621193000_enable_rls_public_tables.
--
-- These tables are accessed through server-side Prisma routes. Realtime
-- features for Kordle and classroom updates use Broadcast channels rather
-- than Postgres Changes, so no anon/authenticated table policies are needed.

ALTER TABLE public."CardPollVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ReadingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomDefaultGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomDefaultGroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardDefaultGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardDefaultGroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CanvaStudentConnectAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarInventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarLoadout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleWord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleGuess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordlePuzzle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."KordleAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarLoadoutItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarPurchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarRewardConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AvatarGalleryEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameWordSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ShoeFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomCheckTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClassroomCheckSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentNotificationState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudentNotificationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CleaningFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SectionMapPlace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SectionMapRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SpeedGameAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ErrorLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BoardActivityEvent" ENABLE ROW LEVEL SECURITY;
