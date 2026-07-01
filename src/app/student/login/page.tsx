import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; return?: string }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  if (params.from) next.set("from", params.from);
  if (params.return) next.set("return", params.return);
  const query = next.toString();
  redirect(query ? `/login?${query}` : "/login");
}
