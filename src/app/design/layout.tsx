import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin-auth";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DesignLayout({ children }: { children: ReactNode }) {
  const access = await requireAdminUser("/design");
  if (!access.authorized) notFound();
  return children;
}
