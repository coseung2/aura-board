"use client";

/**
 * Public applicant form for event-signup boards. Posts to
 * /api/event/submit which handles throttle / captcha / required-field
 * validation. Only the happy path is rendered here; server errors surface
 * as a banner and the form stays editable so the student can fix + retry.
 */
import { useState } from "react";
import type { CustomQuestion } from "@/lib/event/schemas";

type Props = {
  boardId: string;
  token: string;
  ask: {
    name: boolean;
    gradeClass: boolean;
    studentNumber: boolean;
    contact: boolean;
  };
  allowTeam: boolean;
  maxTeamSize: number | null;
  videoPolicy: string;
  videoProviders: string;
  customQuestions: CustomQuestion[];
  requireApproval: boolean;
};

const ERR_MSG: Record<string, string> = {
  invalid_payload: "입력값이 올바르지 않아요.",
  invalid_token: "링크가 만료됐어요. 최신 QR을 받아주세요.",
  not_public: "공개 링크가 비활성화됐어요.",
  not_found: "보드를 찾을 수 없어요.",
  not_event_signup: "행사 신청 보드가 아니에요.",
  captcha_failed: "봇 검증에 실패했어요. 다시 시도해 주세요.",
  throttled: "너무 많이 제출하셨어요. 1시간 뒤 다시 시도해 주세요.",
  application_not_open: "아직 신청이 시작되지 않았어요.",
  application_closed: "신청이 마감됐어요.",
  missing_required: "필수 항목을 입력해 주세요.",
  invalid_youtube_url: "YouTube URL이 올바르지 않아요.",
  bad_request: "요청 형식이 잘못됐어요.",
};

export function EventSignupForm({
  boardId,
  token,
  ask,
  allowTeam,
  maxTeamSize,
  videoPolicy,
  customQuestions,
  requireApproval,
}: Props) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [klass, setKlass] = useState<string>("");
  const [number, setNumber] = useState<string>("");
  const [contact, setContact] = useState("");
  const [teamName, setTeamName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"submitted" | "pending_approval" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function setAns(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        boardId,
        token,
        answers,
      };
      if (ask.name && name) payload.applicantName = name;
      if (ask.gradeClass) {
        const g = Number(grade);
        const c = Number(klass);
        if (Number.isFinite(g)) payload.applicantGrade = g;
        if (Number.isFinite(c)) payload.applicantClass = c;
      }
      if (ask.studentNumber) {
        const n = Number(number);
        if (Number.isFinite(n)) payload.applicantNumber = n;
      }
      if (ask.contact && contact) payload.applicantContact = contact;
      if (allowTeam && teamName) payload.teamName = teamName;
      if (videoPolicy !== "none" && videoUrl.trim()) {
        payload.videoUrl = videoUrl.trim();
      }

      const res = await fetch("/api/event/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(ERR_MSG[j?.error] ?? j?.error ?? `HTTP ${res.status}`);
        return;
      }
      setDone(j.status === "pending_approval" ? "pending_approval" : "submitted");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "제출에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="event-public-success">
        <h2>{done === "pending_approval" ? "승인 대기 중이에요" : "신청 완료!"}</h2>
        <p>
          {done === "pending_approval"
            ? "교사가 승인하면 최종 확정돼요. 내역은 이 페이지에서 확인할 수 있어요."
            : requireApproval
              ? "교사 검토 후 알려드려요."
              : "제출이 완료됐어요. 이 페이지를 닫으셔도 돼요."}
        </p>
      </div>
    );
  }

  return (
    <form className="event-public-form" onSubmit={onSubmit}>
      {err && <div className="event-public-error">{err}</div>}

      {ask.name && (
        <label className="event-public-field">
          <span>
            이름 <em>*</em>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </label>
      )}

      {ask.gradeClass && (
        <div className="event-public-row">
          <label className="event-public-field">
            <span>
              학년 <em>*</em>
            </span>
            <input
              type="number"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              min={1}
              max={12}
              required
            />
          </label>
          <label className="event-public-field">
            <span>
              반 <em>*</em>
            </span>
            <input
              type="number"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              min={1}
              max={30}
              required
            />
          </label>
        </div>
      )}

      {ask.studentNumber && (
        <label className="event-public-field">
          <span>
            번호 <em>*</em>
          </span>
          <input
            type="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            min={1}
            max={200}
            required
          />
        </label>
      )}

      {ask.contact && (
        <label className="event-public-field">
          <span>
            연락처 <em>*</em>
          </span>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={100}
            required
          />
        </label>
      )}

      {allowTeam && (
        <label className="event-public-field">
          <span>팀 이름</span>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={100}
          />
          {maxTeamSize != null && (
            <small className="event-public-hint">최대 {maxTeamSize}명</small>
          )}
        </label>
      )}

      {videoPolicy !== "none" && (
        <label className="event-public-field">
          <span>
            영상 URL (YouTube){videoPolicy === "required" && <em> *</em>}
          </span>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            required={videoPolicy === "required"}
          />
        </label>
      )}

      {customQuestions.map((q) => (
        <label key={q.id} className="event-public-field">
          <span>
            {q.label}
            {q.required && <em> *</em>}
          </span>
          {q.type === "long" ? (
            <textarea
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAns(q.id, e.target.value)}
              required={q.required}
              rows={3}
              maxLength={4000}
            />
          ) : q.type === "select" || q.type === "radio" ? (
            <select
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAns(q.id, e.target.value)}
              required={q.required}
            >
              <option value="">- 선택 -</option>
              {(q.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : q.type === "checkbox" ? (
            <div className="event-public-checkbox-group">
              {(q.options ?? []).map((o) => {
                const checked = Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[]).includes(o)
                  : false;
                return (
                  <label key={o} className="event-public-checkbox-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const prev = Array.isArray(answers[q.id])
                          ? [...(answers[q.id] as string[])]
                          : [];
                        setAns(
                          q.id,
                          e.target.checked
                            ? [...prev, o]
                            : prev.filter((v) => v !== o),
                        );
                      }}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              type="text"
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAns(q.id, e.target.value)}
              required={q.required}
              maxLength={200}
            />
          )}
        </label>
      ))}

      <button type="submit" className="event-public-submit" disabled={submitting}>
        {submitting ? "제출 중…" : "신청하기"}
      </button>
    </form>
  );
}
