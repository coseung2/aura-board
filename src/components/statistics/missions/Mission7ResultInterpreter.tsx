"use client";

export function Mission7ResultInterpreter({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.interpretation as Record<string, string>) ?? {};

  const update = (field: string, newValue: string) => {
    onChange({ ...value, interpretation: { ...data, [field]: newValue } });
  };

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>사실</label>
        <textarea
          value={data.fact ?? ""}
          onChange={(e) => update("fact", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="데이터가 보여주는 사실은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>최고</label>
        <textarea
          value={data.highest ?? ""}
          onChange={(e) => update("highest", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="가장 높게 나타난 결과는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>최저</label>
        <textarea
          value={data.lowest ?? ""}
          onChange={(e) => update("lowest", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="가장 낮게 나타난 결과는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>예상</label>
        <textarea
          value={data.expected ?? ""}
          onChange={(e) => update("expected", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="예상했던 결과는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>예상외</label>
        <textarea
          value={data.unexpected ?? ""}
          onChange={(e) => update("unexpected", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="예상 밖의 결과는 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>의미</label>
        <textarea
          value={data.meaning ?? ""}
          onChange={(e) => update("meaning", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 결과의 의미는 무엇인가요?"
        />
      </div>
    </div>
  );
}
