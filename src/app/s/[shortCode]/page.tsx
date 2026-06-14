/**
 * /s/[shortCode] — static public board shell.
 *
 * The browser reads board/card data directly from Supabase with the short code
 * forwarded as an RLS-bound request header.
 */
import { SupabaseShareBoardClient } from "@/components/share/SupabaseShareBoardClient";

export const dynamic = "force-static";

export default async function ShortShareBoardPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  return <SupabaseShareBoardClient lookupKind="shortCode" lookupValue={shortCode} />;
}
