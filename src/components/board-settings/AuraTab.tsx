"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuraBoardSettings } from "../AuraEvaluationControl";
import { SettingsSection } from "./SettingsSection";

type AuraAssessmentPlan = {
  id?: string;
  subject: string;
  unit: string;
  criterion: string;
  title?: string | null;
  date?: string | null;
};

type AuraPlansCacheEntry = {
  plans: AuraAssessmentPlan[];
  status: "ready" | "empty";
};

const auraPlansCache = new Map<string, AuraPlansCacheEntry>();

function auraPlanKey(
  plan: Pick<AuraAssessmentPlan, "subject" | "unit" | "criterion">,
) {
  return `${plan.subject}\u001f${plan.unit}\u001f${plan.criterion}`;
}

function auraPlanLabel(plan: Pick<AuraAssessmentPlan, "subject" | "unit">) {
  return [plan.subject, plan.unit]
    .filter((part) => part.trim().length > 0)
    .join(" · ");
}

export function AuraTab({
  boardId,
  value,
  onChange,
}: {
  boardId: string;
  value: AuraBoardSettings;
  onChange: (next: AuraBoardSettings) => void;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<AuraAssessmentPlan[]>([]);
  const [plansStatus, setPlansStatus] = useState<
    | { status: "loading" }
    | { status: "ready" }
    | { status: "empty" }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [selectedKey, setSelectedKey] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleErr, setToggleErr] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; at: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const savedKey =
      value.subject && value.criterion
        ? auraPlanKey({
            subject: value.subject,
            unit: value.unit ?? "",
            criterion: value.criterion,
          })
        : "";
    setSelectedKey(savedKey);
    setSaveState({ status: "idle" });
  }, [value.subject, value.unit, value.criterion]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      const cached = auraPlansCache.get(boardId);
      if (cached) {
        setPlans(cached.plans);
        setPlansStatus({ status: cached.status });
        return;
      }
      setPlansStatus({ status: "loading" });
      try {
        const res = await fetch(`/api/boards/${boardId}/aura/plans`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          plans?: AuraAssessmentPlan[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setPlans([]);
            setPlansStatus({
              status: "error",
              message:
                data.error === "aura_oauth_token_issue_failed"
                  ? "Aura Board OAuth 연결을 확인해 주세요."
                  : data.error === "aura_oauth_verify_failed"
                    ? "Aura에서 Board 토큰을 확인하지 못했어요."
                  : "Aura 평가계획을 불러오지 못했어요.",
            });
          }
          return;
        }
        const nextPlans = Array.isArray(data.plans) ? data.plans : [];
        if (!cancelled) {
          setPlans(nextPlans);
          const nextStatus = nextPlans.length > 0 ? "ready" : "empty";
          auraPlansCache.set(boardId, {
            plans: nextPlans,
            status: nextStatus,
          });
          setPlansStatus({ status: nextStatus });
        }
      } catch {
        if (!cancelled) {
          setPlans([]);
          setPlansStatus({
            status: "error",
            message: "Aura 평가계획을 불러오지 못했어요.",
          });
        }
      }
    }

    void loadPlans();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const selectedPlan = plans.find((plan) => auraPlanKey(plan) === selectedKey);
  const savedKey =
    value.subject && value.criterion
      ? auraPlanKey({
          subject: value.subject,
          unit: value.unit ?? "",
          criterion: value.criterion,
        })
      : "";
  const fieldsDirty = Boolean(selectedPlan) && selectedKey !== savedKey;

  async function toggleMode() {
    const next = !value.evaluationEnabled;
    setToggleBusy(true);
    setToggleErr(null);
    onChange({ ...value, evaluationEnabled: next });
    try {
      const res = await fetch(`/api/boards/${boardId}/aura`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationEnabled: next }),
      });
      if (!res.ok) {
        onChange({ ...value, evaluationEnabled: !next });
        setToggleErr("저장에 실패했어요.");
        return;
      }
      const data = (await res.json()) as AuraBoardSettings;
      onChange(data);
      router.refresh();
    } catch {
      onChange({ ...value, evaluationEnabled: !next });
      setToggleErr("저장에 실패했어요.");
    } finally {
      setToggleBusy(false);
    }
  }

  async function saveFields() {
    if (!selectedPlan || !fieldsDirty) return;
    setSaveState({ status: "saving" });
    try {
      const res = await fetch(`/api/boards/${boardId}/aura`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: selectedPlan.subject,
          unit: selectedPlan.unit,
          criterion: selectedPlan.criterion,
        }),
      });
      if (!res.ok) {
        setSaveState({ status: "error", message: "저장에 실패했어요." });
        return;
      }
      const data = (await res.json()) as AuraBoardSettings;
      onChange(data);
      router.refresh();
      setSaveState({ status: "saved", at: Date.now() });
    } catch {
      setSaveState({ status: "error", message: "저장에 실패했어요." });
    }
  }

  return (
    <div className="board-settings-control-stack">
      <button
        type="button"
        className="board-settings-check-row board-settings-check-row-compact board-settings-switch-row"
        role="switch"
        aria-checked={value.evaluationEnabled}
        onClick={() => {
          if (!toggleBusy) void toggleMode();
        }}
        disabled={toggleBusy}
      >
        <span className="board-settings-switch-track" aria-hidden="true">
          <span className="board-settings-switch-thumb" />
        </span>
        <span className="board-settings-check-copy">
          <span className="board-settings-check-title">평가모드</span>
          <span className="board-settings-check-desc">
            카드에 상/중/하 평가를 표시하고 AiFeedback 으로 연동해요.
          </span>
        </span>
      </button>
      {toggleErr && <p className="board-settings-error">{toggleErr}</p>}

      <SettingsSection title="평가 기준">
        <div className="board-settings-control-stack">
          <div className="stream-guidance-field">
            <label className="stream-guidance-label" htmlFor={`aura-plan-${boardId}`}>
              Aura 평가계획
            </label>
            <select
              id={`aura-plan-${boardId}`}
              className="modal-select"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              disabled={
                saveState.status === "saving" ||
                plansStatus.status === "loading" ||
                plans.length === 0
              }
            >
              <option value="">
                {plansStatus.status === "loading"
                  ? "불러오는 중..."
                  : "평가계획을 선택하세요"}
              </option>
              {plans.map((plan) => (
                <option key={auraPlanKey(plan)} value={auraPlanKey(plan)}>
                  {auraPlanLabel(plan)}
                </option>
              ))}
            </select>
          </div>
          {plansStatus.status === "empty" && (
            <p className="board-settings-error">
              Aura에 등록된 평가계획이 없습니다.
            </p>
          )}
          {plansStatus.status === "error" && (
            <p className="board-settings-error">{plansStatus.message}</p>
          )}
          {selectedPlan && (
            <article className="board-settings-row">
              <div className="board-settings-row-title">
                <span className="board-settings-row-name">
                  {auraPlanLabel(selectedPlan)}
                </span>
              </div>
              <p className="board-settings-row-note">
                {selectedPlan.criterion}
              </p>
            </article>
          )}
          <div className="stream-guidance-actions">
            <button
              type="button"
              className="stream-guidance-save"
              onClick={() => void saveFields()}
              disabled={!fieldsDirty || saveState.status === "saving" || !selectedPlan}
            >
              {saveState.status === "saving" ? "저장 중..." : "저장"}
            </button>
            {saveState.status === "saved" && (
              <span className="stream-guidance-status" aria-live="polite">
                저장했어요.
              </span>
            )}
            {saveState.status === "error" && (
              <span className="stream-guidance-error" aria-live="polite">
                {saveState.message}
              </span>
            )}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
