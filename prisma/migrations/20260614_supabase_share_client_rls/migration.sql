-- Supabase client-direct read path for public student share boards.
--
-- This migration lets the browser read only the board identified by the
-- x-share-code or x-share-token request header. PostgREST exposes request
-- headers to SQL through current_setting('request.headers', true), and these
-- helpers keep policy expressions short and consistently null-safe.

ALTER TABLE public."Card"
  ADD COLUMN IF NOT EXISTS "externalAuthorKey" TEXT;

CREATE INDEX IF NOT EXISTS "Card_externalAuthorKey_idx"
  ON public."Card"("externalAuthorKey");

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."Card";
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."Section";
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."CardComment";
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."CardLike";
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.aura_request_header(name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json
    ->> lower(name)
$$;

CREATE OR REPLACE FUNCTION public.aura_share_board_visible(target_board_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Board" b
    WHERE b.id = target_board_id
      AND b."shareMode" = 'student'
      AND (
        (
          public.aura_request_header('x-share-code') IS NOT NULL
          AND b."shareShortCode" = public.aura_request_header('x-share-code')
        )
        OR (
          public.aura_request_header('x-share-token') IS NOT NULL
          AND b."shareToken" = public.aura_request_header('x-share-token')
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.aura_card_section_belongs_to_board(
  target_section_id text,
  target_board_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT target_section_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public."Section" s
      WHERE s.id = target_section_id
        AND s."boardId" = target_board_id
    )
$$;

ALTER TABLE public."Board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Card" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CardAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CardAuthor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CardComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CardLike" ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public."Board" TO anon, authenticated;
GRANT SELECT ON public."Section" TO anon, authenticated;
GRANT SELECT ON public."Card" TO anon, authenticated;
GRANT SELECT ON public."CardAttachment" TO anon, authenticated;
GRANT SELECT ON public."CardAuthor" TO anon, authenticated;
GRANT SELECT ON public."CardComment" TO anon, authenticated;
GRANT SELECT ON public."CardLike" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public."Card" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public."CardAttachment" TO anon, authenticated;
GRANT INSERT ON public."CardComment" TO anon, authenticated;
GRANT INSERT, DELETE ON public."CardLike" TO anon, authenticated;

DROP POLICY IF EXISTS "share_read_board" ON public."Board";
CREATE POLICY "share_read_board"
ON public."Board"
FOR SELECT
TO anon, authenticated
USING (
  "shareMode" = 'student'
  AND (
    (
      public.aura_request_header('x-share-code') IS NOT NULL
      AND "shareShortCode" = public.aura_request_header('x-share-code')
    )
    OR (
      public.aura_request_header('x-share-token') IS NOT NULL
      AND "shareToken" = public.aura_request_header('x-share-token')
    )
  )
);

DROP POLICY IF EXISTS "share_read_sections" ON public."Section";
CREATE POLICY "share_read_sections"
ON public."Section"
FOR SELECT
TO anon, authenticated
USING (public.aura_share_board_visible("boardId"));

DROP POLICY IF EXISTS "share_read_cards" ON public."Card";
CREATE POLICY "share_read_cards"
ON public."Card"
FOR SELECT
TO anon, authenticated
USING (public.aura_share_board_visible("boardId"));

DROP POLICY IF EXISTS "share_read_card_attachments" ON public."CardAttachment";
CREATE POLICY "share_read_card_attachments"
ON public."CardAttachment"
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_read_card_authors" ON public."CardAuthor";
CREATE POLICY "share_read_card_authors"
ON public."CardAuthor"
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_read_card_comments" ON public."CardComment";
CREATE POLICY "share_read_card_comments"
ON public."CardComment"
FOR SELECT
TO anon, authenticated
USING (
  "deletedAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_read_card_likes" ON public."CardLike";
CREATE POLICY "share_read_card_likes"
ON public."CardLike"
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_insert_cards" ON public."Card";
CREATE POLICY "share_insert_cards"
ON public."Card"
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.aura_share_board_visible("boardId")
  AND public.aura_card_section_belongs_to_board("sectionId", "boardId")
  AND "authorId" IS NULL
  AND "studentAuthorId" IS NULL
  AND "externalAuthorKey" = public.aura_request_header('x-share-guest-id')
);

DROP POLICY IF EXISTS "share_update_own_cards" ON public."Card";
CREATE POLICY "share_update_own_cards"
ON public."Card"
FOR UPDATE
TO anon, authenticated
USING (
  public.aura_share_board_visible("boardId")
  AND "authorId" IS NULL
  AND "studentAuthorId" IS NULL
  AND "externalAuthorKey" = public.aura_request_header('x-share-guest-id')
)
WITH CHECK (
  public.aura_share_board_visible("boardId")
  AND public.aura_card_section_belongs_to_board("sectionId", "boardId")
  AND "authorId" IS NULL
  AND "studentAuthorId" IS NULL
  AND "externalAuthorKey" = public.aura_request_header('x-share-guest-id')
);

DROP POLICY IF EXISTS "share_delete_own_cards" ON public."Card";
CREATE POLICY "share_delete_own_cards"
ON public."Card"
FOR DELETE
TO anon, authenticated
USING (
  public.aura_share_board_visible("boardId")
  AND "authorId" IS NULL
  AND "studentAuthorId" IS NULL
  AND "externalAuthorKey" = public.aura_request_header('x-share-guest-id')
);

DROP POLICY IF EXISTS "share_insert_own_card_attachments" ON public."CardAttachment";
CREATE POLICY "share_insert_own_card_attachments"
ON public."CardAttachment"
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
      AND c."authorId" IS NULL
      AND c."studentAuthorId" IS NULL
      AND c."externalAuthorKey" = public.aura_request_header('x-share-guest-id')
  )
);

DROP POLICY IF EXISTS "share_update_own_card_attachments" ON public."CardAttachment";
CREATE POLICY "share_update_own_card_attachments"
ON public."CardAttachment"
FOR UPDATE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
      AND c."authorId" IS NULL
      AND c."studentAuthorId" IS NULL
      AND c."externalAuthorKey" = public.aura_request_header('x-share-guest-id')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
      AND c."authorId" IS NULL
      AND c."studentAuthorId" IS NULL
      AND c."externalAuthorKey" = public.aura_request_header('x-share-guest-id')
  )
);

DROP POLICY IF EXISTS "share_delete_own_card_attachments" ON public."CardAttachment";
CREATE POLICY "share_delete_own_card_attachments"
ON public."CardAttachment"
FOR DELETE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
      AND c."authorId" IS NULL
      AND c."studentAuthorId" IS NULL
      AND c."externalAuthorKey" = public.aura_request_header('x-share-guest-id')
  )
);

DROP POLICY IF EXISTS "share_insert_card_comments" ON public."CardComment";
CREATE POLICY "share_insert_card_comments"
ON public."CardComment"
FOR INSERT
TO anon, authenticated
WITH CHECK (
  "authorKind" = 'external'::public."CommentAuthorKind"
  AND "externalAuthorName" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_insert_card_likes" ON public."CardLike";
CREATE POLICY "share_insert_card_likes"
ON public."CardLike"
FOR INSERT
TO anon, authenticated
WITH CHECK (
  "likerKind" = 'external'::public."CommentAuthorKind"
  AND "externalLikerKey" = public.aura_request_header('x-share-guest-id')
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);

DROP POLICY IF EXISTS "share_delete_own_card_likes" ON public."CardLike";
CREATE POLICY "share_delete_own_card_likes"
ON public."CardLike"
FOR DELETE
TO anon, authenticated
USING (
  "likerKind" = 'external'::public."CommentAuthorKind"
  AND "externalLikerKey" = public.aura_request_header('x-share-guest-id')
  AND EXISTS (
    SELECT 1
    FROM public."Card" c
    WHERE c.id = "cardId"
      AND public.aura_share_board_visible(c."boardId")
  )
);
