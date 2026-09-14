import { GameParticipantPet, type GameParticipantPetData } from "./GameParticipantPet";

export type GameParticipant = {
  id: string;
  name: string;
  joinedAt?: string;
  /** Absent for games that do not resolve classroom pet identity. */
  representativePet?: GameParticipantPetData | null;
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
        {participants.map((participant) =>
          // Games without pet data keep the original name-only chip.
          participant.representativePet === undefined ? (
            <strong key={participant.id}>{participant.name}</strong>
          ) : (
            <strong key={participant.id} className="game-participant-with-pet">
              <GameParticipantPet name={participant.name} pet={participant.representativePet} />
              <span>{participant.name}</span>
            </strong>
          ),
        )}
      </div>
    </div>
  );
}
