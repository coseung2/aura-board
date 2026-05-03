"use client";

export function Mission9PosterRequest({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.posterRequest as Record<string, unknown>) ?? {};
  const discoveries = (data.discoveries as string[]) ?? [];

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, posterRequest: { ...data, [field]: newValue } });
  };

  const addDiscovery = () => {
    update("discoveries", [...discoveries, ""]);
  };

  const removeDiscovery = (index: number) => {
    const next = discoveries.slice();
    next.splice(index, 1);
    update("discoveries", next);
  };

  const updateDiscovery = (index: number, newValue: string) => {
    const next = discoveries.map((d, i) => (i === index ? newValue : d));
    update("discoveries", next);
  };

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>팀 이름</label>
        <input
          type="text"
          value={(data.teamName as string) ?? ""}
          onChange={(e) => update("teamName", e.target.value)}
          disabled={disabled}
          placeholder="팀 이름을 입력하세요."
        />
      </div>
      <div className="form-group">
        <label>주제</label>
        <input
          type="text"
          value={(data.topic as string) ?? ""}
          onChange={(e) => update("topic", e.target.value)}
          disabled={disabled}
          placeholder="포스터의 주제를 입력하세요."
        />
      </div>
      <div className="form-group">
        <label>포스터 제목</label>
        <input
          type="text"
          value={(data.posterTitle as string) ?? ""}
          onChange={(e) => update("posterTitle", e.target.value)}
          disabled={disabled}
          placeholder="포스터 제목을 입력하세요."
        />
      </div>
      <div className="form-group">
        <label>동기</label>
        <textarea
          value={(data.motivation as string) ?? ""}
          onChange={(e) => update("motivation", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 주제를 선택한 동기는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>질문</label>
        <textarea
          value={(data.questions as string) ?? ""}
          onChange={(e) => update("questions", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="조사하고 싶은 질문을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>조사 대상</label>
        <textarea
          value={(data.subjects as string) ?? ""}
          onChange={(e) => update("subjects", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="누구를 대상으로 조사했나요?"
        />
      </div>
      <div className="form-group">
        <label>조사 방법</label>
        <textarea
          value={(data.methods as string) ?? ""}
          onChange={(e) => update("methods", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="어떤 방법으로 조사했나요?"
        />
      </div>
      <div className="form-group">
        <label>핵심 데이터</label>
        <textarea
          value={(data.keyData as string) ?? ""}
          onChange={(e) => update("keyData", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="가장 중요한 데이터는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>그래프</label>
        <textarea
          value={(data.graphs as string) ?? ""}
          onChange={(e) => update("graphs", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="어떤 그래프를 사용했나요?"
        />
      </div>
      <div className="form-group">
        <label>발견</label>
        {discoveries.map((d, index) => (
          <div key={index} className="array-item-row">
            <input
              type="text"
              value={d}
              onChange={(e) => updateDiscovery(index, e.target.value)}
              disabled={disabled}
              placeholder={`발견 ${index + 1}`}
            />
            {!disabled && (
              <button
                className="btn-secondary"
                onClick={() => removeDiscovery(index)}
                type="button"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button className="btn-primary" onClick={addDiscovery} type="button">
            발견 추가
          </button>
        )}
      </div>
      <div className="form-group">
        <label>결론</label>
        <textarea
          value={(data.conclusion as string) ?? ""}
          onChange={(e) => update("conclusion", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="전체적인 결론을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>제안</label>
        <textarea
          value={(data.proposal as string) ?? ""}
          onChange={(e) => update("proposal", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="제안 사항을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>한계점</label>
        <textarea
          value={(data.limitations as string) ?? ""}
          onChange={(e) => update("limitations", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="한계점을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>분위기</label>
        <textarea
          value={(data.mood as string) ?? ""}
          onChange={(e) => update("mood", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="포스터에 담고 싶은 분위기나 느낌을 적어주세요."
        />
      </div>
    </div>
  );
}
