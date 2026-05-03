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

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>주제</label>
        <textarea
          value={data.subject ?? ""}
          onChange={(e) => update("subject", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="조사하고 싶은 주제를 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>호기심</label>
        <textarea
          value={data.curiosity ?? ""}
          onChange={(e) => update("curiosity", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 주제에 대해 궁금한 점은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>이해관계자</label>
        <textarea
          value={data.stakeholders ?? ""}
          onChange={(e) => update("stakeholders", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 주제와 관련된 사람들은 누구인가요?"
        />
      </div>
      <div className="form-group">
        <label>관련성</label>
        <textarea
          value={data.relevance ?? ""}
          onChange={(e) => update("relevance", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 주제가 우리와 어떤 관련이 있나요?"
        />
      </div>
    </div>
  );
}
