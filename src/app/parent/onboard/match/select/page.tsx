"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentPickerCard, type StudentLite } from "@/components/parent/StudentPickerCard";
import { OnboardingShell } from "../../_shell";

// parent-class-invite-v2 — P4 Student Pick.

export default function MatchSelectWrapper() {
  return (
    <Suspense fallback={null}>
      <MatchSelectPage />
    </Suspense>
  );
}

function MatchSelectPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ticket = sp.get("ticket") ?? "";
  const [classroomName, setClassroomName] = useState<string>("");
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ticket) {
      router.replace("/parent/onboard/match/code");
      return;
    }
    (async () => {
      const r = await fetch(`/api/parent/match/students?ticket=${encodeURIComponent(ticket)}`);
      if (!r.ok) {
        setErr("다시 코드를 입력해 주세요");
        return;
      }
      const j = await r.json();
      setClassroomName(j.classroomName);
      setStudents(j.students);
      setLoading(false);
    })();
  }, [ticket, router]);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    const r = await fetch("/api/parent/match/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket, studentId: selected }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) setErr("이미 신청한 학생이 3명입니다. 승인 후 다시 시도해 주세요.");
      else if (j.error === "invalid_ticket") setErr("다시 코드를 입력해 주세요");
      else setErr("신청에 실패했습니다");
      return;
    }
    router.push("/parent/home");
  };

  return (
    <OnboardingShell step={3} total={4}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{classroomName}</h1>
      <p style={{ margin: "4px 0 16px", fontSize: 14, color: "var(--color-text-muted)" }}>
        자녀를 선택하세요.
      </p>
      {loading ? (
        <div style={{ color: "var(--color-text-muted)" }}>불러오는 중...</div>
      ) : (
        <div
          role="radiogroup"
          aria-label="자녀 목록"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
            gap: 12,
          }}
        >
          {students.map((s) => (
            <StudentPickerCard key={s.id} student={s} selected={selected === s.id} onSelect={setSelected} />
          ))}
        </div>
      )}
      {err && <p style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 12 }}>{err}</p>}
      <button
        type="button"
        disabled={!selected || submitting}
        onClick={submit}
        style={{
          marginTop: 24,
          width: "100%",
          height: 56,
          borderRadius: "var(--radius-btn)",
          border: "none",
          background: selected ? "var(--color-accent)" : "var(--color-border)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          cursor: selected && !submitting ? "pointer" : "not-allowed",
        }}
      >
        {submitting ? "신청 중..." : "이 학생의 학부모로 신청"}
      </button>
    </OnboardingShell>
  );
}
