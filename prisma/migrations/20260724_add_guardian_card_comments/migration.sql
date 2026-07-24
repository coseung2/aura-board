CREATE TYPE "CardCommentAudience" AS ENUM ('public', 'guardian');

ALTER TABLE "CardComment"
  ADD COLUMN "audience" "CardCommentAudience" NOT NULL DEFAULT 'public',
  ADD COLUMN "authorParentId" TEXT;

ALTER TABLE "CardCommentLike"
  ADD COLUMN "likerParentId" TEXT;

ALTER TABLE "CardLike"
  ADD COLUMN "likerParentId" TEXT;

CREATE INDEX "CardComment_authorParentId_idx"
  ON "CardComment"("authorParentId");
CREATE UNIQUE INDEX "CardComment_authorParentId_cardId_clientRequestId_key"
  ON "CardComment"("authorParentId", "cardId", "clientRequestId");
CREATE UNIQUE INDEX "CardCommentLike_commentId_likerParentId_key"
  ON "CardCommentLike"("commentId", "likerParentId");
CREATE UNIQUE INDEX "CardLike_cardId_likerParentId_key"
  ON "CardLike"("cardId", "likerParentId");

ALTER TABLE "CardComment"
  ADD CONSTRAINT "CardComment_authorParentId_fkey"
  FOREIGN KEY ("authorParentId") REFERENCES "Parent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardCommentLike"
  ADD CONSTRAINT "CardCommentLike_likerParentId_fkey"
  FOREIGN KEY ("likerParentId") REFERENCES "Parent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardLike"
  ADD CONSTRAINT "CardLike_likerParentId_fkey"
  FOREIGN KEY ("likerParentId") REFERENCES "Parent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Share-link clients remain public-only even when they query Supabase directly.
DROP POLICY IF EXISTS "share_read_card_comments" ON public."CardComment";
CREATE POLICY "share_read_card_comments"
ON public."CardComment"
FOR SELECT
TO anon, authenticated
USING (
  "audience" = 'public'::public."CardCommentAudience"
  AND "deletedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_insert_card_comments" ON public."CardComment";
CREATE POLICY "share_insert_card_comments"
ON public."CardComment"
FOR INSERT
TO anon, authenticated
WITH CHECK (
  "audience" = 'public'::public."CardCommentAudience"
  AND "authorKind" = 'external'::public."CommentAuthorKind"
  AND "authorParentId" IS NULL
  AND "externalAuthorName" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);
