"use client";

export function Mission5DataCollection({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.dataCollection as Record<string, unknown>) ?? {};

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, dataCollection: { ...data, [field]: newValue } });
  };

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>응답자 수</label>
        <input
          type="number"
          value={(data.respondentCount as number) ?? ""}
          onChange={(e) => update("respondentCount", Number(e.target.value))}
          disabled={disabled}
          placeholder="실제 응답한 사람의 수를 입력하세요."
        />
      </div>
      <div className="form-group">
        <label>조사 기간</label>
        <input
          type="text"
          value={(data.period as string) ?? ""}
          onChange={(e) => update("period", e.target.value)}
          disabled={disabled}
          placeholder="예: 5월 1일 ~ 5월 7일"
        />
      </div>
      <div className="form-group">
        <label>특이사항</label>
        <textarea
          value={(data.notes as string) ?? ""}
          onChange={(e) => update("notes", e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="수집 과정에서 특이했던 점이나 어려움을 적어주세요."
        />
      </div>
    </div>
  );
}
