import { GameParticipantPet } from "@/features/games/components/GameParticipantPet";
import type { SpeedGameWire } from "./types";
import styles from "./SpeedGamePlayers.module.css";

export function SpeedGamePlayers({ participants, currentStudentId }: {
  participants: SpeedGameWire["participants"];
  currentStudentId: string | null;
}) {
  return (
    <section aria-label="참가자">
      <ul className={styles.players}>
        {participants.map((participant) => (
          <li className={styles.player} key={participant.studentId}>
            <GameParticipantPet name={participant.name} pet={participant.representativePet} size={56} />
            <span>
              <strong>{participant.name}</strong>
              {participant.studentId === currentStudentId ? " · 나" : ""}
              {participant.forfeitedAt ? " · 나감" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
