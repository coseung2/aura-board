-- Fix Supabase Security Advisor warning `function_search_path_mutable`.
--
-- These functions are reachable from public schema policies or public RPC.
-- Keep search_path immutable so object resolution cannot be influenced by the
-- caller's role-level search_path.

DO $$
BEGIN
  IF to_regprocedure('public.get_schools_by_office(text, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.get_schools_by_office(text, integer)
      SET search_path = public, pg_catalog;
  END IF;
END $$;

ALTER FUNCTION public.aura_request_header(text)
  SET search_path = '';

ALTER FUNCTION public.aura_share_board_visible(text)
  SET search_path = '';

ALTER FUNCTION public.aura_card_section_belongs_to_board(text, text)
  SET search_path = '';
