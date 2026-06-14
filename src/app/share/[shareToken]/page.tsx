/**
 * /share/[shareToken] — static public board shell.
 *
 * The browser reads board/card data directly from Supabase with the share token
 * forwarded as an RLS-bound request header.
 */
import { SupabaseShareBoardClient } from "@/components/share/SupabaseShareBoardClient";

export const dynamic = "force-static";

export default async function ShareBoardPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <SupabaseShareBoardClient lookupKind="shareToken" lookupValue={shareToken} />;
}
