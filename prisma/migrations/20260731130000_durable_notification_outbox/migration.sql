-- Durable notification center and compact trigger-written outbox.
CREATE TABLE public."StudentNotification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "cardTitle" TEXT NOT NULL,
    "boardTitle" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "StudentNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentNotification_kind_check"
      CHECK ("kind" IN ('like', 'comment', 'reward', 'refund', 'attendance', 'assignment'))
);

CREATE TABLE public."NotificationOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationOutbox_status_check"
      CHECK ("status" IN ('pending', 'processing', 'done', 'dead')),
    CONSTRAINT "NotificationOutbox_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "StudentNotification_studentId_eventKey_key"
    ON public."StudentNotification"("studentId", "eventKey");
CREATE UNIQUE INDEX "StudentNotification_studentId_kind_sourceId_key"
    ON public."StudentNotification"("studentId", "kind", "sourceId");
CREATE INDEX "StudentNotification_studentId_createdAt_idx"
    ON public."StudentNotification"("studentId", "createdAt");
CREATE INDEX "StudentNotification_studentId_readAt_createdAt_idx"
    ON public."StudentNotification"("studentId", "readAt", "createdAt");
CREATE UNIQUE INDEX "NotificationOutbox_eventType_sourceId_key"
    ON public."NotificationOutbox"("eventType", "sourceId");
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_createdAt_idx"
    ON public."NotificationOutbox"("status", "nextAttemptAt", "createdAt");

ALTER TABLE public."StudentNotification"
    ADD CONSTRAINT "StudentNotification_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES public."Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Both tables are consumed only by the custom-session Node API. They receive
-- no anon/authenticated policy and therefore are not a browser data surface.
ALTER TABLE public."StudentNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."StudentNotification" FROM anon, authenticated;
REVOKE ALL ON TABLE public."NotificationOutbox" FROM anon, authenticated;

-- Trigger writers can originate from Data API mutations. Keep the privileged
-- function outside exposed schemas, pin its search_path, and make it
-- non-callable by browser roles; its only entry points are the five triggers.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.enqueue_notification_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."NotificationOutbox" (
    "id", "eventType", "sourceId", "status", "attempts",
    "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid()::text, TG_ARGV[0], NEW."id", 'pending', 0,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("eventType", "sourceId") DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_notification_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_notification_outbox() FROM anon, authenticated;

CREATE TRIGGER "notification_outbox_card_like_insert"
AFTER INSERT ON public."CardLike"
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_outbox('card_like');

CREATE TRIGGER "notification_outbox_card_comment_insert"
AFTER INSERT ON public."CardComment"
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_outbox('card_comment');

CREATE TRIGGER "notification_outbox_transaction_insert"
AFTER INSERT ON public."Transaction"
FOR EACH ROW
WHEN (
  (NEW."type" = 'deposit' AND NEW."sourceType" IN (
    'reading_reward', 'walking_reward', 'walking_weekly_reward',
    'walking_classroom_rank_reward', 'assignment_reward', 'comment_reward',
    'attendance_reward', 'reading_weekly_mission_reward',
    'reading_classroom_rank_reward'
  ))
  OR (NEW."type" = 'refund' AND NEW."sourceType" = 'slime_item_refund')
)
EXECUTE FUNCTION private.enqueue_notification_outbox('transaction');

CREATE TRIGGER "notification_outbox_parent_child_link_insert"
AFTER INSERT ON public."ParentChildLink"
FOR EACH ROW
WHEN (NEW."status" = 'pending' AND NEW."deletedAt" IS NULL)
EXECUTE FUNCTION private.enqueue_notification_outbox('parent_link');

CREATE TRIGGER "notification_outbox_assignment_slot_insert"
AFTER INSERT ON public."AssignmentSlot"
FOR EACH ROW
WHEN (NEW."submissionStatus" = 'assigned')
EXECUTE FUNCTION private.enqueue_notification_outbox('assignment_slot');

-- Bounded 30-day history, capped per source. This only materializes rows whose
-- recipient can be proven from current relational data; it does not send old
-- pushes or fabricate data for deleted/inaccessible sources.
WITH recent AS (
  SELECT l.*
  FROM public."CardLike" l
  WHERE l."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND l."likerKind" IN ('teacher', 'student', 'external')
  ORDER BY l."createdAt" DESC
  LIMIT 5000
), recipients AS (
  SELECT r.*, c."title" AS "cardTitle", c."studentAuthorId",
         b."title" AS "boardTitle", b."slug", b."anonymousAuthor",
         u."name" AS "teacherName", ls."name" AS "studentName",
         ca."studentId" AS "recipientId"
  FROM recent r
  JOIN public."Card" c ON c."id" = r."cardId"
  JOIN public."Board" b ON b."id" = c."boardId"
  LEFT JOIN public."User" u ON u."id" = r."likerUserId"
  LEFT JOIN public."Student" ls ON ls."id" = r."likerStudentId"
  CROSS JOIN LATERAL (
    SELECT c."studentAuthorId" AS "studentId"
    UNION
    SELECT a."studentId" FROM public."CardAuthor" a WHERE a."cardId" = c."id"
  ) ca
  WHERE ca."studentId" IS NOT NULL
    AND ca."studentId" IS DISTINCT FROM r."likerStudentId"
)
INSERT INTO public."StudentNotification" (
  "id", "studentId", "eventKey", "sourceId", "kind", "actorLabel",
  "cardTitle", "boardTitle", "href", "createdAt"
)
SELECT gen_random_uuid()::text, "recipientId", 'like:' || "id", "id", 'like',
       CASE
         WHEN "anonymousAuthor" THEN '익명'
         WHEN "likerKind" = 'teacher' THEN COALESCE(NULLIF(BTRIM("teacherName"), '') || ' 선생님', '선생님')
         WHEN "likerKind" = 'student' THEN COALESCE(NULLIF(BTRIM("studentName"), ''), '학생')
         ELSE '방문자'
       END,
       COALESCE("cardTitle", ''), COALESCE("boardTitle", ''), '/board/' || "slug", "createdAt"
FROM recipients
ON CONFLICT ("studentId", "eventKey") DO NOTHING;

WITH recent AS (
  SELECT c.*
  FROM public."CardComment" c
  WHERE c."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND c."deletedAt" IS NULL
  ORDER BY c."createdAt" DESC
  LIMIT 5000
), recipients AS (
  SELECT r.*, c."title" AS "cardTitle", c."studentAuthorId",
         b."title" AS "boardTitle", b."slug", b."anonymousAuthor",
         u."name" AS "teacherName", aus."name" AS "studentName",
         ca."studentId" AS "recipientId"
  FROM recent r
  JOIN public."Card" c ON c."id" = r."cardId"
  JOIN public."Board" b ON b."id" = c."boardId"
  LEFT JOIN public."User" u ON u."id" = r."authorUserId"
  LEFT JOIN public."Student" aus ON aus."id" = r."authorStudentId"
  CROSS JOIN LATERAL (
    SELECT c."studentAuthorId" AS "studentId"
    UNION
    SELECT a."studentId" FROM public."CardAuthor" a WHERE a."cardId" = c."id"
  ) ca
  WHERE ca."studentId" IS NOT NULL
    AND ca."studentId" IS DISTINCT FROM r."authorStudentId"
)
INSERT INTO public."StudentNotification" (
  "id", "studentId", "eventKey", "sourceId", "kind", "actorLabel",
  "cardTitle", "boardTitle", "href", "content", "createdAt"
)
SELECT gen_random_uuid()::text, "recipientId", 'comment:' || "id", "id", 'comment',
       CASE
         WHEN "anonymousAuthor" THEN '익명'
         WHEN "authorKind" = 'teacher' THEN COALESCE(NULLIF(BTRIM("teacherName"), '') || ' 선생님', '선생님')
         WHEN "authorKind" = 'student' THEN COALESCE(NULLIF(BTRIM("studentName"), ''), '학생')
         ELSE COALESCE(NULLIF(BTRIM("externalAuthorName"), ''), '방문자')
       END,
       COALESCE("cardTitle", ''), COALESCE("boardTitle", ''), '/board/' || "slug",
       LEFT(REGEXP_REPLACE("content", '\s+', ' ', 'g'), 72), "createdAt"
FROM recipients
ON CONFLICT ("studentId", "eventKey") DO NOTHING;

WITH recent AS (
  SELECT t.*
  FROM public."Transaction" t
  WHERE t."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND (
      (t."type" = 'deposit' AND t."sourceType" IN (
        'reading_reward', 'walking_reward', 'walking_weekly_reward',
        'walking_classroom_rank_reward', 'assignment_reward', 'comment_reward',
        'attendance_reward', 'reading_weekly_mission_reward',
        'reading_classroom_rank_reward'
      ))
      OR (t."type" = 'refund' AND t."sourceType" = 'slime_item_refund')
    )
  ORDER BY t."createdAt" DESC
  LIMIT 5000
)
INSERT INTO public."StudentNotification" (
  "id", "studentId", "eventKey", "sourceId", "kind", "actorLabel",
  "cardTitle", "boardTitle", "href", "content", "createdAt"
)
SELECT gen_random_uuid()::text, a."studentId",
       CASE WHEN r."type" = 'refund' THEN 'refund:' ELSE 'reward:' END || r."id",
       r."id", CASE WHEN r."type" = 'refund' THEN 'refund' ELSE 'reward' END,
       CASE WHEN r."type" = 'refund' THEN '상점' ELSE '보상' END,
       CASE
         WHEN r."type" = 'refund' THEN '상점에서 사라진 물건 값을 돌려드렸어요'
         WHEN r."sourceType" = 'reading_reward' THEN '독서 보상'
         WHEN r."sourceType" = 'comment_reward' THEN '댓글 보상'
         WHEN r."sourceType" = 'walking_reward' THEN '걷기 보상'
         WHEN r."sourceType" = 'walking_weekly_reward' THEN '주간 걷기 보상'
         WHEN r."sourceType" = 'walking_classroom_rank_reward' THEN '우리 반 걷기 순위 보상'
         WHEN r."sourceType" = 'assignment_reward' THEN '과제 제출 보상'
         WHEN r."sourceType" = 'attendance_reward' THEN '출석 보상'
         WHEN r."sourceType" = 'reading_weekly_mission_reward' THEN '주간 독서 미션 보상'
         WHEN r."sourceType" = 'reading_classroom_rank_reward' THEN '우리 반 독서 순위 보상'
         ELSE '보상'
       END,
       '내 통장', '/my/wallet',
       CONCAT_WS(' · ', NULLIF(r."note", ''), '+' || TO_CHAR(r."amount", 'FM999G999G999') || ' ' || COALESCE(cc."unitLabel", '원')),
       r."createdAt"
FROM recent r
JOIN public."StudentAccount" a ON a."id" = r."accountId"
LEFT JOIN public."ClassroomCurrency" cc ON cc."classroomId" = a."classroomId"
ON CONFLICT ("studentId", "eventKey") DO NOTHING;

WITH recent AS (
  SELECT d.*
  FROM public."StudentPushDispatch" d
  WHERE d."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    AND d."kind" IN ('attendance', 'assignment')
  ORDER BY d."createdAt" DESC
  LIMIT 5000
)
INSERT INTO public."StudentNotification" (
  "id", "studentId", "eventKey", "sourceId", "kind", "actorLabel",
  "cardTitle", "boardTitle", "href", "content", "createdAt"
)
SELECT gen_random_uuid()::text, "studentId", "eventKey", "id", "kind", 'Aura Board',
       COALESCE("title", CASE WHEN "kind" = 'attendance' THEN '오늘 출석을 확인해 주세요' ELSE '새 과제가 도착했어요' END),
       CASE WHEN "kind" = 'attendance' THEN '출석' ELSE '과제' END,
       COALESCE("href", '/student'), "body", "createdAt"
FROM recent
ON CONFLICT ("studentId", "eventKey") DO NOTHING;

-- Preserve legacy individual receipts and the mark-all cursor for rows that
-- were safely backfilled above.
UPDATE public."StudentNotification" n
SET "readAt" = s."lastReadAt"
FROM public."StudentNotificationState" s
WHERE s."studentId" = n."studentId"
  AND s."lastReadAt" IS NOT NULL
  AND n."createdAt" <= s."lastReadAt";

UPDATE public."StudentNotification" n
SET "readAt" = r."readAt"
FROM public."StudentNotificationReceipt" r
WHERE r."studentId" = n."studentId"
  AND r."notificationType" = n."kind"
  AND r."notificationId" = n."sourceId";

-- Handoff: until a Supabase Database Webhook calls the same consumer endpoint
-- (or an Edge Function invokes it), Vercel polls this durable table each minute.
-- At handoff, remove only the notification-push cron schedule; triggers,
-- leases, idempotency keys, and the Node consumer remain authoritative.
