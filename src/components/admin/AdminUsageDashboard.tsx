"use client";

import { useEffect, useMemo, useState } from "react";

type UsageUser = {
  user?: { id: string; name?: string | null; email?: string | null };
  eventCount?: number; activeDays?: number; lastActiveAt?: string | null;
  features?: Record<string, number>;
};
type UsageResponse = {
  summary?: Record<string, number>; users?: UsageUser[]; eventsByName?: Record<string, number>;
};
const labels: Record<string, string> = {
  activeUsers: "활성 사용자", totalEvents: "전체 이벤트", eventTypes: "사용 기능 수",
};

export function AdminUsageDashboard() {
  const [period, setPeriod] = useState("30");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsageResponse>({});
  const [loading, setLoading] = useState(true);
  const pageSize = 25;
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    fetch(`/api/admin/usage?days=${period}`, { cache: "no-store", signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("request_failed")))
      .then((json) => setData(json ?? {})).catch(() => { if (!controller.signal.aborted) setData({}); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period]);
  const summary = data.summary ?? {};
  const allUsers = data.users ?? [];
  const users = allUsers.filter((u) => { const q = query.trim().toLowerCase(); return !q || `${u.user?.name ?? ""} ${u.user?.email ?? ""}`.toLowerCase().includes(q); });
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const visibleUsers = users.slice((page - 1) * pageSize, page * pageSize);
  const featureKeys = Object.keys(data.eventsByName ?? {}).slice(0, 6);
  const csv = useMemo(() => {
    const header = ["이름", "이메일", "이벤트", "활성 일수", ...featureKeys, "최근 활동"];
    const rows = users.map((u) => [u.user?.name ?? "", u.user?.email ?? "", String(u.eventCount ?? 0), String(u.activeDays ?? 0), ...featureKeys.map((k) => String(u.features?.[k] ?? 0)), u.lastActiveAt ?? ""]);
    return [header, ...rows].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  }, [users]);
  function downloadCsv() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `aura-usage-${period}d.csv`; a.click(); URL.revokeObjectURL(a.href); }
  return <>
    <section className="admin-section admin-usage-controls" aria-label="사용량 조회 조건">
      <div className="admin-section-head"><div><h2>활용량 조회</h2><p>최근 기간 동안 실제 활동한 사용자와 기능 사용 횟수입니다.</p></div><button type="button" className="admin-section-link" onClick={downloadCsv} disabled={!users.length}>CSV 다운로드</button></div>
      <div className="admin-usage-filter-row"><label>기간<select value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><label className="admin-usage-search">사용자 검색<input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="이름 또는 이메일" /></label></div>
    </section>
    <section className="admin-metric-grid" aria-label="활성 사용자 지표">{Object.entries(labels).map(([key, label]) => <article className="admin-metric-card" key={key}><span>{label}</span><strong>{(summary[key] ?? 0).toLocaleString("ko-KR")}</strong></article>)}</section>
    <section className="admin-section"><div className="admin-section-head"><div><h2>사용자별 활용량</h2><p>{loading ? "불러오는 중…" : `총 ${users.length.toLocaleString("ko-KR")}명`}</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>사용자</th><th>이벤트</th><th>활성 일수</th>{featureKeys.map((k) => <th key={k}>{k}</th>)}<th>최근 활동</th></tr></thead><tbody>{visibleUsers.length ? visibleUsers.map((u) => <tr key={u.user?.id}><td><div className="admin-user-cell"><strong>{u.user?.name || "이름 없음"}</strong><span>{u.user?.email}</span></div></td><td>{u.eventCount ?? 0}</td><td>{u.activeDays ?? 0}</td>{featureKeys.map((k) => <td key={k}>{u.features?.[k] ?? 0}</td>)}<td>{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString("ko-KR") : "-"}</td></tr>) : <tr><td colSpan={featureKeys.length + 4} className="admin-empty-cell">{loading ? "불러오는 중…" : "활동 데이터가 없습니다."}</td></tr>}</tbody></table></div><div className="admin-pagination"><button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</button><span>{page} / {totalPages}</span><button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</button></div></section>
  </>;
}
