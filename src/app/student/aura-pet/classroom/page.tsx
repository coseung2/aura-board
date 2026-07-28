import { redirect } from "next/navigation";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";

export default async function ClassroomSlimeGalleryPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/aura-pet/classroom");
  redirect("/student/aura-pet?section=classroom");
}
