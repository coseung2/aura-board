import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

// The standalone 학급 역할 page is gone (2026-07-27); the dashboard's 1인1역
// section now owns role listing, salary, permissions, and assignment.
export default async function ClassroomRolesPage({ params }: Props) {
  const { id } = await params;
  redirect(`/classroom/${id}/dashboard`);
}
