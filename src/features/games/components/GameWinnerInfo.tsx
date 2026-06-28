export type GameWinnerLeaderboardItem = {
  id: string;
  name: string;
  wins: number;
};

export type GameRoundWinner = {
  id: string;
  roundNumber: number;
  winners: Array<{ id: string; name: string }>;
  resultLabel: string;
};

type Props = {
  ariaLabel: string;
  leaderboard: GameWinnerLeaderboardItem[];
  latestRound?: GameRoundWinner | null;
  title?: string;
  emptyLabel?: string;
  latestRoundTitle?: string;
  className?: string;
};

export function GameWinnerInfo({
  ariaLabel,
  leaderboard,
  latestRound,
  title = "우승 기록",
  emptyLabel = "아직 우승자가 없습니다",
  latestRoundTitle = "최근 회차",
  className,
}: Props) {
  return (
    <aside className={["game-winner-info", className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      <div className="game-winner-section">
        <p className="game-winner-label">{title}</p>
        {leaderboard.length > 0 ? (
          <ol className="game-winner-list">
            {leaderboard.map((winner) => (
              <li key={winner.id}>
                <span>{winner.name}</span>
                <strong>{winner.wins}승</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="game-winner-empty">{emptyLabel}</p>
        )}
      </div>
      {latestRound && (
        <div className="game-winner-section">
          <p className="game-winner-label">{latestRoundTitle}</p>
          <p className="game-round-winner">
            <span>{latestRound.roundNumber}회차</span>
            <strong>{latestRound.winners.map((winner) => winner.name).join(", ")}</strong>
            <small>{latestRound.resultLabel}</small>
          </p>
        </div>
      )}
    </aside>
  );
}
