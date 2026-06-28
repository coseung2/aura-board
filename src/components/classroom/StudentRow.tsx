"use client";

import { useEffect, useState } from "react";

const AVATAR_COLORS = [
  "#a69bff",
  "#ff9ebd",
  "#8ccfff",
  "#ffd28c",
  "#9ee5c1",
  "#ffb08c",
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatarInitial(name: string): string {
  return name ? name.slice(0, 1) : "?";
}

export type Student = {
  id: string;
  number: number | null;
  name: string;
  gender?: string | null;
  qrToken: string;
  textCode: string;
  createdAt: string;
};

type Props = {
  student: Student;
  classroomId: string;
  parentCount: number;
  roleKey: string;
  roleDefs: { key: string; labelKo: string; emoji: string | null }[];
  onRoleChange: (roleKey: string) => void;
  onGenderChange: (gender: string) => void;
  checked: boolean;
  onToggle: () => void;
  onReissue: () => void;
  onDelete: () => void;
};

export function StudentRow({
  student,
  classroomId,
  parentCount,
  roleKey,
  roleDefs,
  onRoleChange,
  onGenderChange,
  checked,
  onToggle,
  onReissue,
  onDelete,
}: Props) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      const url = `${window.location.origin}/qr/${student.qrToken}`;
      QRCode.toDataURL(url, { width: 40, margin: 1 }).then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [student.qrToken]);

  return (
    <tr className="classroom-tr">
      <td className="classroom-td" style={{ width: 36 }}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="classroom-td classroom-td-num">{student.number ?? "-"}</td>
      <td className="classroom-td classroom-td-avatar">
        <span
          className="classroom-avatar"
          style={{ background: avatarColor(student.name) }}
          aria-hidden
        >
          {avatarInitial(student.name)}
        </span>
      </td>
      <td className="classroom-td classroom-td-name">
        <div className="classroom-name-stack">
          <span className="classroom-name-text">{student.name}</span>
          <select
            className="classroom-role-select classroom-role-select-inline"
            value={student.gender ?? ""}
            onChange={(e) => onGenderChange(e.target.value)}
            aria-label={`${student.name} 성별`}
          >
            <option value="">미정</option>
            <option value="female">여</option>
            <option value="male">남</option>
          </select>
          <select
            className="classroom-role-select classroom-role-select-inline"
            value={roleKey}
            onChange={(e) => onRoleChange(e.target.value)}
            aria-label={`${student.name} 역할`}
          >
            <option value="">역할 없음</option>
            {roleDefs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.emoji ? `${d.emoji} ` : ""}
                {d.labelKo}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="classroom-td classroom-td-qr">
        {qrSrc ? (
          // QR is a data: URL generated client-side - next/image can't optimize it
          // and the origin is our own page, so a raw <img> is intentional here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt="QR" className="classroom-qr-thumb" loading="lazy" />
        ) : (
          <span className="classroom-qr-placeholder" />
        )}
      </td>
      <td className="classroom-td classroom-td-code">
        <code className="classroom-text-code">{student.textCode}</code>
      </td>
      <td className="classroom-td classroom-td-parent">
        <a
          href={`/classroom/${classroomId}/parent-access?student=${student.id}`}
          className={`classroom-parent-chip ${parentCount === 0 ? "is-empty" : ""}`}
          title={
            parentCount === 0 ? "연결된 학부모 없음" : `학부모 ${parentCount}명`
          }
        >
          {parentCount === 0 ? "-" : `${parentCount}명`}
        </a>
      </td>
      <td className="classroom-td classroom-td-actions">
        <div className="classroom-row-actions">
          <button
            type="button"
            className="classroom-row-btn classroom-row-btn-reissue"
            onClick={onReissue}
            title="QR 재발급"
          >
            재발급
          </button>
          <button
            type="button"
            className="classroom-row-btn classroom-row-btn-delete"
            onClick={onDelete}
            title="삭제"
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}
