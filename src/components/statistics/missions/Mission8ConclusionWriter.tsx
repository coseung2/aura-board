"use client";

export function Mission8ConclusionWriter({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.conclusion as Record<string, unknown>) ?? {};
  const findings = (data.findings as string[]) ?? ["", "", ""];

  const update = (field: string, newValue: unknown) => {
    onChange({ ...value, conclusion: { ...data, [field]: newValue } });
  };

  return (
    <div className="mission-form">
      <div className="form-group">
        <label>발견 1</label>
        <textarea
          value={findings[0] ?? ""}
          onChange={(e) => {
            const next = findings.slice();
            next[0] = e.target.value;
            update("findings", next);
          }}
          disabled={disabled}
          rows={2}
          placeholder="첫 번째 주요 발견을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>발견 2</label>
        <textarea
          value={findings[1] ?? ""}
          onChange={(e) => {
            const next = findings.slice();
            next[1] = e.target.value;
            update("findings", next);
          }}
          disabled={disabled}
          rows={2}
          placeholder="두 번째 주요 발견을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>발견 3</label>
        <textarea
          value={findings[2] ?? ""}
          onChange={(e) => {
            const next = findings.slice();
            next[2] = e.target.value;
            update("findings", next);
          }}
          disabled={disabled}
          rows={2}
          placeholder="세 번째 주요 발견을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>결론</label>
        <textarea
          value={(data.conclusion as string) ?? ""}
          onChange={(e) => update("conclusion", e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="조사 결과의 전체적인 결론을 적어주세요."
        />
      </div>
      <div className="form-group">
        <label>제안</label>
        <textarea
          value={(data.proposal as string) ?? ""}
          onChange={(e) => update("proposal", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 문제를 해결하기 위한 제안은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>학교에서 할 수 있는 일</label>
        <textarea
          value={(data.schoolAction as string) ?? ""}
          onChange={(e) => update("schoolAction", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="학교에서 실천할 수 있는 것은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>집에서 할 수 있는 일</label>
        <textarea
          value={(data.homeAction as string) ?? ""}
          onChange={(e) => update("homeAction", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="집에서 실천할 수 있는 것은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>친구와 함께 할 수 있는 일</label>
        <textarea
          value={(data.friendAction as string) ?? ""}
          onChange={(e) => update("friendAction", e.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="친구와 함께 실천할 수 있는 것은 무엇인가요?"
        />
      </div>
      <div className="form-group">
        <label>한계점</label>
        <textarea
          value={(data.limitations as string) ?? ""}
          onChange={(e) => update("limitations", e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="이 조사의 한계점은 무엇인가요?"
        />
      </div>
    </div>
  );
}
