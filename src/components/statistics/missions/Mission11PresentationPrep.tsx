"use client";

export function Mission11PresentationPrep({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.presentation as Record<string, unknown>) ?? {};
  const structure = (data.structure as string[]) ?? [];

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, presentation: { ...data, [field]: newValue } });
  };

  const addStructure = () => {
    update("structure", [...structure, ""]);
  };

  const removeStructure = (index: number) => {
    const next = structure.slice();
    next.splice(index, 1);
    update("structure", next);
  };

  const updateStructure = (index: number, newValue: string) => {
    const next = structure.map((s, i) => (i === index ? newValue : s));
    update("structure", next);
  };

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>발표 구성</label>
        {structure.map((s, index) => (
          <div key={index} className="array-item-row">
            <input
              type="text"
              value={s}
              onChange={(e) => updateStructure(index, e.target.value)}
              disabled={disabled}
              placeholder={`항목 ${index + 1}`}
            />
            {!disabled && (
              <button
                className="btn-secondary"
                onClick={() => removeStructure(index)}
                type="button"
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button className="btn-primary" onClick={addStructure} type="button">
            항목 추가
          </button>
        )}
      </div>
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.ready as boolean) ?? false}
            onChange={(e) => update("ready", e.target.checked)}
            disabled={disabled}
          />
          발표 준비 완료
        </label>
      </div>
    </div>
  );
}
