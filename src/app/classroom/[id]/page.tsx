import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

// Landing route redirects to the dashboard, which now hosts the roster,
// seating, boards, and banking sections inline (2026-07-27). The individual
// routes under /classroom/:id/* stay reachable from the top nav.
export default async function ClassroomDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/classroom/${id}/dashboard`);
}
