"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchBreakoutTemplates } from "@/lib/client-lookup-cache";

type Template = {
  id: string;
  key: string;
  name: string;
  description: string;
  tier: "free" | "pro";
  requiresPro: boolean;
  scope: "system" | "teacher" | "school";
  recommendedVisibility: "own-only" | "peek-others";
  defaultGroupCount: number;
  defaultGroupCapacity: number;
};

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  classrooms: ClassroomItem[];
  userTier: "free" | "pro";
  onClose: () => void;
  onBack?: () => void;
};

const TEMPLATE_EMOJI: Record<string, string> = {
  kwl_chart: "📊",
  brainstorm: "💡",
  icebreaker: "🧊",
  pros_cons: "⚖️",
  jigsaw: "🧩",
  presentation_prep: "🎤",
  gallery_walk: "🖼️",
  six_hats: "🎩",
};

export function CreateBreakoutBoardModal({
  classrooms,
  userTier,
  onClose,
  onBack,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"template" | "config" | "confirm">("template");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groupCount, setGroupCount] = useState(4);
  const [groupCapacity, setGroupCapacity] = useState(6);
  const [visibility, setVisibility] = useState<"own-only" | "peek-others" | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBreakoutTemplates()
      .then((nextTemplates) => {
        if (!cancelled) {
          setTemplates(nextTemplates);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  function handleTemplatePick(t: Template) {
    if (t.requiresPro && userTier !== "pro") {
      setError("이 템플릿은 Pro 전용이에요. 업그레이드 후 이용해주세요.");
      return;
    }
    setError(null);
    setSelectedId(t.id);
    setGroupCount(t.defaultGroupCount);
    setGroupCapacity(t.defaultGroupCapacity);
    setVisibility(null); // use template default
    setStep("config");
  }

  async function submit() {
    if (!selectedTemplate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "",
          layout: "breakout",
          classroomId: classroomId || undefined,
          breakoutConfig: {
            templateId: selectedTemplate.id,
            groupCount,
            groupCapacity,
            visibilityOverride: visibility,
            deployMode: "link-fixed",
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "pro_required") {
          setError("이 템플릿은 Pro 전용이에요.");
        } else {
          setError(`보드 생성 실패: ${data?.error ?? res.statusText}`);
        }
        setBusy(false);
        return;
      }
      const { board } = await res.json();
      router.push(`/board/${board.slug}`);
    } catch (e) {
      console.error(e);
      setError("보드 생성 중 오류가 발생했습니다.");
      setBusy(false);
    }
  }

  const effectiveVisibility =
    visibility ?? selectedTemplate?.recommendedVisibility ?? "own-only";

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal create-board-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {step === "template" && "모둠 학습 템플릿 선택"}
            {step === "config" && "모둠 구성"}
            {step === "confirm" && "확인"}
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          {step === "template" && (
            <>
              <p className="create-board-hint">
                모둠별 독립 작업 공간을 만들 템플릿을 고르세요. 템플릿 원본이 수정되어도 이미 만든 보드는 영향받지 않아요.
              </p>
              {loading ? (
                <p className="create-board-hint">불러오는 중…</p>
              ) : (
                <div className="layout-picker">
                  {templates.map((t) => {
                    const locked = t.requiresPro && userTier !== "pro";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="layout-option"
                        onClick={() => handleTemplatePick(t)}
                        aria-disabled={locked}
                        disabled={busy}
                        style={locked ? { opacity: 0.55 } : undefined}
                      >
                        <span className="layout-option-emoji">{TEMPLATE_EMOJI[t.key] ?? "👥"}</span>
                        <span className="layout-option-label">
                          {t.name}
                          {t.requiresPro && (
                            <span className="board-badge" style={{ marginLeft: 6 }}>
                              {locked ? "🔒 Pro" : "Pro"}
                            </span>
                          )}
                        </span>
                        <span className="layout-option-desc">
                          {t.description}
                          <br />
                          <small>
                            {t.recommendedVisibility === "peek-others" ? "👁 모둠 간 열람 허용" : "🔒 자기 모둠만"}
                            {" · "}기본 {t.defaultGroupCount}모둠
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {onBack && (
                <div className="modal-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="modal-btn-cancel" onClick={onBack} disabled={busy}>
                    ← 뒤로
                  </button>
                </div>
              )}
            </>
          )}

          {step === "config" && selectedTemplate && (
            <>
              <p className="create-board-hint">
                선택한 템플릿: <strong>{selectedTemplate.name}</strong>
              </p>
              <div style={{ display: "grid", gap: 12, padding: "12px 0" }}>
                <label>
                  모둠 수 (1-10)
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={groupCount}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setGroupCount(Math.max(1, Math.min(10, v)));
                    }}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  모둠 정원 (1-6)
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={groupCapacity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setGroupCapacity(Math.max(1, Math.min(6, v)));
                    }}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <fieldset style={{ border: 0, padding: 0 }}>
                  <legend style={{ marginBottom: 6 }}>
                    열람 모드 (템플릿 권장: {selectedTemplate.recommendedVisibility === "peek-others" ? "모둠 간 허용" : "자기 모둠만"})
                  </legend>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility === null}
                      onChange={() => setVisibility(null)}
                    />{" "}
                    권장값 사용
                  </label>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility === "own-only"}
                      onChange={() => setVisibility("own-only")}
                    />{" "}
                    🔒 자기 모둠만
                  </label>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      name="visibility"
                      checked={visibility === "peek-others"}
                      onChange={() => setVisibility("peek-others")}
                    />{" "}
                    👁 모둠 간 열람 허용
                  </label>
                </fieldset>
                {classrooms.length > 0 && (
                  <label>
                    학급 연결 (선택)
                    <select
                      value={classroomId}
                      onChange={(e) => setClassroomId(e.target.value)}
                      style={{ width: "100%", padding: 8 }}
                    >
                      <option value="">연결 안 함</option>
                      {classrooms.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (학생 {c.studentCount}명)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setStep("template")}
                  disabled={busy}
                >
                  ← 뒤로
                </button>
                <button
                  type="button"
                  className="modal-btn-save"
                  onClick={() => setStep("confirm")}
                  disabled={busy}
                >
                  다음 →
                </button>
              </div>
            </>
          )}

          {step === "confirm" && selectedTemplate && (
            <>
              <p className="create-board-hint">아래 내용으로 보드를 만들어요.</p>
              <ul style={{ lineHeight: 1.8 }}>
                <li>템플릿: <strong>{selectedTemplate.name}</strong></li>
                <li>모둠 수: {groupCount}</li>
                <li>모둠 정원: {groupCapacity}</li>
                <li>열람 모드: {effectiveVisibility === "peek-others" ? "모둠 간 열람 허용" : "자기 모둠만"}</li>
                {classroomId && (
                  <li>학급: {classrooms.find((c) => c.id === classroomId)?.name}</li>
                )}
              </ul>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setStep("config")}
                  disabled={busy}
                >
                  ← 뒤로
                </button>
                <button
                  type="button"
                  className="modal-btn-save"
                  onClick={submit}
                  disabled={busy}
                >
                  {busy ? "만드는 중…" : "보드 만들기"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
