-- Pin function lookup to pg_catalog and explicitly qualified objects.
-- This clears Supabase's mutable search_path warning without changing behavior.
ALTER FUNCTION public."liveQuizCounterShard"(TEXT, TEXT)
SET search_path = '';

ALTER FUNCTION public."incrementLiveQuizQuestionCounterShard"()
SET search_path = '';
