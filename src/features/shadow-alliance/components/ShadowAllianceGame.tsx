"use client";

import { ShadowAllianceStudentGame } from "./ShadowAllianceStudentGame";
import { ShadowAllianceTeacherGame } from "./ShadowAllianceTeacherGame";
import { useShadowAllianceGame } from "../useShadowAllianceGame";
import { PlayBoardContinueButton } from "@/components/PlayBoardContinueButton";

type Props = {
  boardId: string;
  viewer: "teacher" | "student";
};

export function ShadowAllianceGame({ boardId, viewer }: Props) {
  const game = useShadowAllianceGame({ boardId, viewer });

  if (viewer === "student") {
    return (
      <>
      <PlayBoardContinueButton />
        <ShadowAllianceStudentGame
          connection={game.connection}
          joinPending={game.joinPending}
          player={game.studentPlayer}
          snapshot={game.snapshot}
          onRetryJoin={game.requestJoin}
          onSubmitNumber={game.submitNumber}
        />
      </>
    );
  }

  return (
    <ShadowAllianceTeacherGame
        game={game.game}
        connection={game.connection}
        rankings={game.rankings}
        onAddPlayer={game.addPlayer}
        onRemovePlayer={game.removePlayer}
        onRebalanceTeams={game.rebalanceTeams}
        onSetSettings={game.setSettings}
        onStartGame={game.startGame}
        onResetGame={game.resetGame}
        onNextRound={game.nextRound}
        onRevealRound={game.revealRound}
        onShowPostround={game.showPostround}
        onSetTimerRunning={game.setTimerRunning}
      />
  );
}
