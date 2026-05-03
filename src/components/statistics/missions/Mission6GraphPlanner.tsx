"use client";

const GRAPH_TYPES = [
  { key: "bar", label: "막대그래프" },
  { key: "pie", label: "원그래프" },
  { key: "line", label: "꺾은선그래프" },
  { key: "grouped-bar", label: "묶은막대그래프" },
  { key: "map", label: "지도" },
];

export function Mission6GraphPlanner({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const plans = (value.graphPlans as Array<Record<string, unknown>>) ?? [];

  const updatePlans = (newPlans: Array<Record<string, unknown>>) => {
    onChange({ ...value, graphPlans: newPlans });
  };

  const addPlan = () => {
    updatePlans([...plans, { content: "", type: "bar", insight: "" }]);
  };

  const removePlan = (index: number) => {
    const next = plans.slice();
    next.splice(index, 1);
    updatePlans(next);
  };

  const updatePlan = (index: number, field: string, newValue: unknown) => {
    const next = plans.map((plan, i) =>
      i === index ? { ...plan, [field]: newValue } : plan
    );
    updatePlans(next);
  };

  return (
    <div className="mission-form">
      {plans.map((plan, index) => (
        <div key={index} className="form-group graph-plan-item">
          <div className="graph-plan-header">
            <strong>그래프 계획 {index + 1}</strong>
            {!disabled && (
              <button
                className="btn-secondary"
                onClick={() => removePlan(index)}
                type="button"
              >
                삭제
              </button>
            )}
          </div>
          <label>내용</label>
          <textarea
            value={(plan.content as string) ?? ""}
            onChange={(e) => updatePlan(index, "content", e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="어떤 내용을 그래프로 나타낼 것인가요?"
          />
          <label>그래프 종류</label>
          <select
            value={(plan.type as string) ?? "bar"}
            onChange={(e) => updatePlan(index, "type", e.target.value)}
            disabled={disabled}
          >
            {GRAPH_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <label>기대하는 인사이트</label>
          <textarea
            value={(plan.insight as string) ?? ""}
            onChange={(e) => updatePlan(index, "insight", e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="이 그래프를 통해 알고 싶은 점은 무엇인가요?"
          />
        </div>
      ))}
      {!disabled && (
        <button className="btn-primary" onClick={addPlan} type="button">
          그래프 계획 추가
        </button>
      )}
    </div>
  );
}
