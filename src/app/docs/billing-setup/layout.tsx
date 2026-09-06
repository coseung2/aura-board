import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin-auth";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BillingSetupLayout({ children }: { children: ReactNode }) {
  const access = await requireAdminUser("/docs/billing-setup");
  if (!access.authorized) notFound();
  return children;
}
