"use client";

export function Mission10PosterReview({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.posterReview as Record<string, unknown>) ?? {};

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, posterReview: { ...data, [field]: newValue } });
  };

  return (
    <div className="mission-form">
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.isAccurate as boolean) ?? false}
            onChange={(e) => update("isAccurate", e.target.checked)}
            disabled={disabled}
          />
          내용이 사실과 일치한다
        </label>
      </div>
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.titleCorrect as boolean) ?? false}
            onChange={(e) => update("titleCorrect", e.target.checked)}
            disabled={disabled}
          />
          제목이 적절하다
        </label>
      </div>
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.conclusionVisible as boolean) ?? false}
            onChange={(e) => update("conclusionVisible", e.target.checked)}
            disabled={disabled}
          />
          결론이 잘 드러난다
        </label>
      </div>
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.noFabrication as boolean) ?? false}
            onChange={(e) => update("noFabrication", e.target.checked)}
            disabled={disabled}
          />
          허위 사실이 없다
        </label>
      </div>
      <div className="form-group checkbox-group">
        <label className="inline-label">
          <input
            type="checkbox"
            checked={(data.limitationIncluded as boolean) ?? false}
            onChange={(e) => update("limitationIncluded", e.target.checked)}
            disabled={disabled}
          />
          한계점이 포함되어 있다
        </label>
      </div>
      <div className="form-group">
        <label>수정 요청사항</label>
        <textarea
          value={(data.revisionRequests as string) ?? ""}
          onChange={(e) => update("revisionRequests", e.target.value)}
          disabled={disabled}
          rows={5}
          placeholder="수정이 필요한 부분이 있다면 적어주세요."
        />
      </div>
    </div>
  );
}
