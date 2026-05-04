"use client";

const EVIDENCE_OPTIONS = [
  "실제 경험이 있는지",
  "우리 주변에 얼마나 있는지",
  "왜 이런 일이 생겼는지",
  "어떤 조건이면 괜찮은지",
  "어떤 대안이 가능한지",
];

const FEASIBILITY_OPTIONS = [
  "친구들에게 물어볼 수 있다.",
  "우리 주변에서 직접 살펴볼 수 있다.",
  "숫자로 셀 수 있다.",
  "그래프로 나타낼 수 있다.",
  "조사 결과로 제안을 만들 수 있다.",
];

export function Mission1TopicCard({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const data = (value.topic as Record<string, unknown>) ?? {};

  const text = (field: string) =>
    typeof data[field] === "string" ? (data[field] as string) : "";

  const list = (field: string) =>
    Array.isArray(data[field]) ? (data[field] as string[]) : [];

  const update = (field: string, newValue: string | string[]) => {
    onChange({ ...value, topic: { ...data, [field]: newValue } });
  };

  const toggle = (field: string, option: string) => {
    const current = list(field);
    update(
      field,
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  };

  return (
    <div className="mission-form">
      <section className="mission-form-card">
        <label className="mission-form-label" htmlFor="mission1-issue">
          1. 어떤 이슈를 조사할까요?
        </label>
        <p className="mission-form-helper">
          우리 주변에서 친구들마다 생각이 다르거나, 실제로 불편을 겪는 문제를 적어 봅시다.
        </p>
        <textarea
          id="mission1-issue"
          value={text("issue")}
          onChange={(event) => update("issue", event.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="예) 노키즈존은 초등학생에게도 적용되어야 할까?"
        />
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label" htmlFor="mission1-curiosity">
          2. 이 이슈는 왜 궁금해졌나요?
        </label>
        <p className="mission-form-helper">
          처음 궁금해진 장면이나, 주변에서 본 일을 적어 봅시다.
        </p>
        <textarea
          id="mission1-curiosity"
          value={text("curiosity")}
          onChange={(event) => update("curiosity", event.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="예) 가족과 카페에 가려고 했는데 어린이는 들어갈 수 없다는 안내를 본 적이 있어서 궁금해졌습니다."
        />
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label">
          3. 이 이슈와 관련된 사람은 누구인가요?
        </label>
        <p className="mission-form-helper">
          좋은 주제는 관련된 사람이 한쪽만 있는 것이 아니라, 여러 입장이 있습니다.
        </p>
        <div className="mission-stakeholder-list">
          {[1, 2, 3, 4].map((index) => (
            <input
              key={index}
              type="text"
              value={text(`stakeholder${index}`)}
              onChange={(event) =>
                update(`stakeholder${index}`, event.target.value)
              }
              disabled={disabled}
              placeholder={
                index === 1
                  ? "예) 초등학생"
                  : index === 2
                    ? "예) 학부모"
                    : index === 3
                      ? "예) 카페 사장님"
                      : "예) 다른 손님"
              }
            />
          ))}
        </div>
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label">
          4. 사람마다 어떤 생각이 다를까요?
        </label>
        <p className="mission-form-helper">
          관련된 사람들의 입장이 어떻게 다를지 예상해 봅시다.
        </p>
        <div className="mission-perspective-grid">
          {[1, 2, 3, 4].map((index) => (
            <div className="mission-perspective-row" key={index}>
              <input
                type="text"
                value={text(`perspectivePerson${index}`)}
                onChange={(event) =>
                  update(`perspectivePerson${index}`, event.target.value)
                }
                disabled={disabled}
                placeholder="관련된 사람"
              />
              <textarea
                value={text(`perspectiveThought${index}`)}
                onChange={(event) =>
                  update(`perspectiveThought${index}`, event.target.value)
                }
                disabled={disabled}
                rows={2}
                placeholder="예상되는 생각"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label" htmlFor="mission1-evidence">
          5. 이 이슈에서 우리가 확인해야 할 것은 무엇인가요?
        </label>
        <p className="mission-form-helper">
          바로 찬성/반대를 묻지 말고, 먼저 확인해야 할 증거를 생각해 봅시다.
        </p>
        <textarea
          id="mission1-evidence"
          value={text("evidence")}
          onChange={(event) => update("evidence", event.target.value)}
          disabled={disabled}
          rows={3}
          placeholder="예) 학생들이 노키즈존을 경험한 적이 있는지, 노키즈존이 생기는 이유를 어떻게 생각하는지 확인해야 합니다."
        />
        <div className="mission-choice-list">
          {EVIDENCE_OPTIONS.map((option) => (
            <label className="inline-label" key={option}>
              <input
                type="checkbox"
                checked={list("evidenceChecks").includes(option)}
                onChange={() => toggle("evidenceChecks", option)}
                disabled={disabled}
              />
              {option}
            </label>
          ))}
        </div>
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label">
          6. 이 이슈는 조사할 수 있나요?
        </label>
        <div className="mission-choice-list">
          {FEASIBILITY_OPTIONS.map((option) => (
            <label className="inline-label" key={option}>
              <input
                type="checkbox"
                checked={list("feasibilityChecks").includes(option)}
                onChange={() => toggle("feasibilityChecks", option)}
                disabled={disabled}
              />
              {option}
            </label>
          ))}
        </div>
      </section>

      <section className="mission-form-card">
        <label className="mission-form-label" htmlFor="mission1-title">
          7. 우리 팀의 임시 탐구 제목을 정해 봅시다
        </label>
        <p className="mission-form-helper">질문형 제목으로 적어 봅시다.</p>
        <input
          id="mission1-title"
          type="text"
          value={text("title")}
          onChange={(event) => update("title", event.target.value)}
          disabled={disabled}
          placeholder="예) 노키즈존, 나이로 막을까 행동으로 볼까?"
        />
      </section>
    </div>
  );
}
