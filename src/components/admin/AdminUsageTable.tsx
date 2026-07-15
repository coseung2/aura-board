"use client";

import { useMemo, useState } from "react";

export type AdminUsageTableRow = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  boardCount: number;
  classroomCount: number;
  studentCount: number;
  cardCount: number;
  storageBytes: number;
  lastBoardUpdatedAt: string | null;
};

type SortKey =
  | "user"
  | "createdAt"
  | "boardCount"
  | "classroomCount"
  | "studentCount"
  | "cardCount"
  | "storageBytes"
  | "lastBoardUpdatedAt";
type SortDirection = "asc" | "desc";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "user", label: "가입자" },
  { key: "createdAt", label: "가입일" },
  { key: "boardCount", label: "보드" },
  { key: "classroomCount", label: "학급" },
  { key: "studentCount", label: "학생" },
  { key: "cardCount", label: "카드" },
  { key: "storageBytes", label: "용량" },
  { key: "lastBoardUpdatedAt", label: "최근 보드 변경" },
];

export function AdminUsageTable({ rows }: { rows: AdminUsageTableRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "createdAt",
    direction: "desc",
  });
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const comparison = compareUsageRows(left, right, sort.key);
        return sort.direction === "asc" ? comparison : -comparison;
      }),
    [rows, sort],
  );

  function toggleSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const isActive = sort.key === column.key;
              const directionLabel = sort.direction === "asc" ? "오름차순" : "내림차순";
              return (
                <th
                  key={column.key}
                  aria-sort={
                    isActive
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="admin-table-sort-button"
                    onClick={() => toggleSort(column.key)}
                    aria-label={`${column.label} ${
                      isActive ? directionLabel : "오름차순"
                    }으로 정렬`}
                  >
                    <span>{column.label}</span>
                    <span className="admin-table-sort-indicator" aria-hidden="true">
                      {isActive ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((user) => (
            <tr key={user.id}>
              <td>
                <div className="admin-user-cell">
                  <strong>{user.name || "이름 없음"}</strong>
                  <span>{user.email}</span>
                </div>
              </td>
              <td>{formatDate(user.createdAt)}</td>
              <td>{user.boardCount}</td>
              <td>{user.classroomCount}</td>
              <td>{user.studentCount}</td>
              <td>{user.cardCount}</td>
              <td>{formatBytes(user.storageBytes)}</td>
              <td>{user.lastBoardUpdatedAt ? formatDateTime(user.lastBoardUpdatedAt) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareUsageRows(
  left: AdminUsageTableRow,
  right: AdminUsageTableRow,
  key: SortKey,
): number {
  if (key === "user") {
    return `${left.name}\u0000${left.email}`.localeCompare(
      `${right.name}\u0000${right.email}`,
      "ko",
    );
  }
  const leftValue = sortValue(left, key);
  const rightValue = sortValue(right, key);
  return leftValue - rightValue;
}

function sortValue(row: AdminUsageTableRow, key: Exclude<SortKey, "user">): number {
  if (key === "createdAt") return new Date(row.createdAt).getTime();
  if (key === "lastBoardUpdatedAt") {
    return row.lastBoardUpdatedAt ? new Date(row.lastBoardUpdatedAt).getTime() : -1;
  }
  return row[key];
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}
