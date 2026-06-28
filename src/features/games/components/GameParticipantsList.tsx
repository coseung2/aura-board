export type GameParticipant = {
  id: string;
  name: string;
  joinedAt?: string;
};

type Props = {
  label?: string;
  participants: GameParticipant[];
  className?: string;
};

export function GameParticipantsList({
  label = "입장한 학생",
  participants,
  className,
}: Props) {
  if (participants.length === 0) return null;

  return (
    <div className={["game-participant-list", className].filter(Boolean).join(" ")}>
      {label && <span>{label}</span>}
      <div>
        {participants.map((participant) => (
          <strong key={participant.id}>{participant.name}</strong>
        ))}
      </div>
    </div>
  );
}
