import { redirect } from "next/navigation";

/** Keep existing bookmarks working after the student pet route rename. */
export default function StudentCreaturesLegacyPage() {
  redirect("/student/aura-pet");
}
