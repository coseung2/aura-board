import { redirect } from "next/navigation";

/** Keep existing bookmarks working after the admin pet route rename. */
export default function AdminCreaturesLegacyPage() {
  redirect("/admin/aura-pet");
}
