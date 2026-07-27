import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

// The standalone 게시판 route is gone (2026-07-27); its 과제 and 청소 groups
// are now dashboard sections. Old links and bookmarks land on the dashboard.
export default async function ClassroomMorningPage({ params }: Props) {
  const { id } = await params;
  redirect(`/classroom/${id}/dashboard`);
}
