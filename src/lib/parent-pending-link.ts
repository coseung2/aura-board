export type ParentPendingLinkView = {
  id: string;
  studentName: string;
  studentNumber: number | null;
  classroomName: string;
  requestedAtLabel: string;
  expiresInDays: number;
};

const PENDING_EXPIRES_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toParentPendingLink(link: {
  id: string;
  requestedAt: Date;
  student: {
    name: string;
    number: number | null;
    classroom: { name: string };
  };
}, now = Date.now()): ParentPendingLinkView {
  const expiresAt = link.requestedAt.getTime() + PENDING_EXPIRES_DAYS * DAY_MS;
  return {
    id: link.id,
    studentName: link.student.name,
    studentNumber: link.student.number,
    classroomName: link.student.classroom.name,
    requestedAtLabel: formatDate(link.requestedAt),
    expiresInDays: Math.max(0, Math.ceil((expiresAt - now) / DAY_MS)),
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
