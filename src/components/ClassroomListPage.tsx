"use client";

import { useRouter } from "next/navigation";
import { ClassroomList } from "./ClassroomList";

type ClassroomItem = {
  id: string;
  name: string;
  code: string;
  _count: { students: number; boards: number };
};

type Props = {
  initialClassrooms: ClassroomItem[];
  autoOpenCreate?: boolean;
  resumeBoardLayout?: string | null;
};

export function ClassroomListPage({
  initialClassrooms,
  autoOpenCreate = false,
  resumeBoardLayout = null,
}: Props) {
  const router = useRouter();

  return (
    <ClassroomList
      classrooms={initialClassrooms}
      onRefresh={() => router.refresh()}
      autoOpenCreate={autoOpenCreate}
      resumeBoardLayout={resumeBoardLayout}
    />
  );
}
