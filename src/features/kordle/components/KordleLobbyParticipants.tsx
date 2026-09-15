"use client";
import { GameParticipantsList } from "@/features/games/components/GameParticipantsList";
import { useKordleLobbyPresence } from "./use-kordle-lobby-presence";

export function KordleLobbyParticipants({ boardId }: { boardId: string }) {
  const participants = useKordleLobbyPresence(boardId);
  return <section className="kordle-teacher-participants" aria-label="대기실 접속 학생">
    <div className="kordle-teacher-participants-header"><span>대기실 접속</span><strong>{participants === null ? "확인 중" : `${participants.length}명`}</strong></div>
    {participants && participants.length > 0 && <GameParticipantsList label="" className="kordle-participant-list"
      participants={participants.map((item) => ({ id: item.studentId, name: item.name, joinedAt: item.joinedAt }))} />}
    {participants?.length === 0 && <p>아직 대기실에 있는 학생이 없어요.</p>}
  </section>;
}
