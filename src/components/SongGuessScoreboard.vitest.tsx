import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
import { rankSongGuessParticipants, SongGuessScoreboard } from "./SongGuessScoreboard";

vi.mock("./creatures/SlimeCharacterSprite", () => ({
  SlimeCharacterSprite: ({ slime, growthStage }: { slime: { color: string }; growthStage: number }) => <span data-testid="pet" data-color={slime.color} data-stage={growthStage} />,
}));

const participants: SongGuessSnapshot["participants"] = [
  { participantId: "first", displayName: "같은 이름", score: 700, scoredCurrentRound: true },
  { participantId: "second", displayName: "같은 이름", score: 1000, scoredCurrentRound: true,
    representativePet: { color: "blue", growthStage: 2, equippedItemKeys: [], hiddenItemKeys: [], equippedTitleKey: null } },
  { participantId: "third", displayName: "세 번째", score: 700, scoredCurrentRound: true },
  { participantId: "fourth", displayName: "네 번째", score: 0, scoredCurrentRound: false },
];

describe("song-guess rankings", () => {
  it("ranks by server points and gives tied scores equal ranks without mutating the snapshot", () => {
    const ranked = rankSongGuessParticipants(participants);
    expect(ranked.map((entry) => [entry.participantId, entry.rank])).toEqual([["second", 1], ["first", 2], ["third", 2], ["fourth", 4]]);
    expect(participants[0].participantId).toBe("first");
  });

  it("keeps duplicate names distinct and shows the persisted representative pet", () => {
    render(<SongGuessScoreboard participants={participants} />);
    const rows = within(screen.getByRole("list", { name: "현재 순위" })).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByTestId("pet")).toHaveAttribute("data-color", "blue");
    expect(within(rows[0]).getByTestId("pet")).toHaveAttribute("data-stage", "2");
    expect(within(rows[1]).queryByTestId("pet")).not.toBeInTheDocument();
  });

  it("shows the top three podium and the complete final ranking", () => {
    render(<SongGuessScoreboard participants={participants} podium />);
    const podium = screen.getByRole("list", { name: "상위 3명" });
    expect(within(podium).getAllByRole("listitem")).toHaveLength(3);
    expect(within(podium).queryByText("네 번째")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "전체 순위" })).getAllByRole("listitem")).toHaveLength(4);
  });

  it("handles a single participant and empty results without invented places", () => {
    const { rerender } = render(<SongGuessScoreboard participants={participants.slice(0, 1)} podium />);
    expect(within(screen.getByRole("list", { name: "상위 3명" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("2위")).not.toBeInTheDocument();
    rerender(<SongGuessScoreboard participants={[]} podium />);
    expect(screen.queryByRole("list", { name: "상위 3명" })).not.toBeInTheDocument();
    expect(screen.getByText("참가 학생 없음")).toBeInTheDocument();
  });
});
