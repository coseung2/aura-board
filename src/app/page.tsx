import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

// Root dispatcher: authenticated teachers go straight to their dashboard,
// everyone else gets the public landing page. /landing is intentionally not
// a return/callback target, so we never read search params here.
export default async function AppEntryPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }
  redirect("/landing");
}
