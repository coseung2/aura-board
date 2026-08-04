"use client";

export type StudentTitleProgress = {
  key: string;
  label: string;
  imagePath: string;
  requirement: string;
  effectKey: string;
  buffBps: number;
  earned: boolean;
  claimed: boolean;
};

const EFFECT_LABELS: Record<string, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 보상",
  comment_reward: "댓글 보상",
};

type Props = {
  titles: StudentTitleProgress[];
  emptyHint: string;
  claimingKey: string | null;
  onClaim: (titleKey: string) => void;
};

/** Flat title collection matching the native student activity screens. */
export function StudentTitleCollection({
  titles,
  emptyHint,
  claimingKey,
  onClaim,
}: Props) {
  const claimedCount = titles.filter((title) => title.claimed).length;

  return (
    <section className="student-title-collection" aria-labelledby="student-title-collection-heading">
      <div className="student-title-collection-header">
        <h2 id="student-title-collection-heading">칭호</h2>
        <span aria-label={`${titles.length}개 중 ${claimedCount}개 수령`}>
          {claimedCount} / {titles.length}
        </span>
      </div>

      {claimedCount === 0 ? (
        <p className="student-title-empty-hint">{emptyHint}</p>
      ) : null}

      <ul className="student-title-list">
        {titles.map((title) => {
          const claimable = title.earned && !title.claimed;
          const effectLabel = EFFECT_LABELS[title.effectKey] ?? "보상";
          const buffText = `${effectLabel} +${title.buffBps / 100}%`;
          const stateLabel = title.claimed
            ? "수령 완료"
            : claimable
              ? "수령 가능"
              : "미달성";

          return (
            <li
              key={title.key}
              className={`student-title-row${claimable ? " is-claimable" : ""}${
                title.earned ? "" : " is-locked"
              }`}
              aria-label={`${title.label} 칭호, ${title.requirement}, ${buffText}, ${stateLabel}`}
            >
              <span className="student-title-tag" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={title.imagePath} alt="" />
              </span>
              <span className="student-title-meta">
                <strong>{title.requirement}</strong>
                <small className={claimable ? "is-claimable" : undefined}>
                  {stateLabel} · {buffText}
                </small>
              </span>
              {claimable ? (
                <button
                  type="button"
                  className="student-title-claim"
                  disabled={claimingKey !== null}
                  onClick={() => onClaim(title.key)}
                  aria-label={`${title.label} 칭호 수령`}
                >
                  {claimingKey === title.key ? "받는 중…" : "받기"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
