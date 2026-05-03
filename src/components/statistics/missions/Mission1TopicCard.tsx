"use client";

export function Mission1TopicCard({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.topic as Record<string, string>) ?? {};

  const update = (field: string, newValue: string) => {
    onChange({ ...value, topic: { ...data, [field]: newValue } });
  };

  const fields: {
    key: string;
    label: string;
    helper: string;
    placeholder: string;
  }[] = [
    {
      key: "subject",
      label: "어떤 주제를 조사할까요?",
      helper: "친구들이 실제로 보고, 묻고, 셀 수 있는 주제가 좋아요.",
      placeholder: "예) 우리 반 친구들이 가장 좋아하는 급식 메뉴",
    },
    {
      key: "curiosity",
      label: "이 주제가 왜 궁금해요?",
      helper: "처음 궁금해진 장면이나 이유를 한 문장으로 적어 보세요.",
      placeholder: "예) 급식 시간마다 좋아하는 메뉴가 친구마다 달라 보여요.",
    },
    {
      key: "stakeholders",
      label: "누구에게 도움이 될까요?",
      helper: "이 주제를 조사하면 도움이 될 수 있는 사람을 생각해 보세요.",
      placeholder: "예) 우리 반 친구들, 급식실 선생님, 메뉴를 정하는 분들",
    },
    {
      key: "relevance",
      label: "우리와 무슨 관련이 있을까요?",
      helper: "우리 반 생활이나 학교 생활과 이어지는 점을 적어 보세요.",
      placeholder: "예) 매일 먹는 급식이라 우리 반 모두의 생활과 이어져요.",
    },
  ];

  return (
    <div className="mission-form">
      {fields.map((f) => (
        <div className="mission-form-card" key={f.key}>
          <label className="mission-form-label">{f.label}</label>
          <p className="mission-form-helper">{f.helper}</p>
          <textarea
            className="mission-form-textarea"
            value={data[f.key] ?? ""}
            onChange={(e) => update(f.key, e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder={f.placeholder}
          />
        </div>
      ))}
    </div>
  );
}
