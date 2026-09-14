import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameLobby } from "./GameLobby";

vi.mock("@/features/games/components/GameParticipantPet", () => ({
  GameParticipantPet: () => <span role="img" aria-label="대표펫" />,
}));

describe("GameLobby pet opt-in", () => {
  it("keeps anonymous and other non-opted-in rosters free of pet displays", () => {
    render(<GameLobby participants={[{ id: "anonymous-slot", name: "플레이어 1" }]} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("allows an opted-in student without a representative to use the common fallback", () => {
    render(<GameLobby participants={[{ id: "student-a", name: "학생", representativePet: null }]} />);
    expect(screen.getByRole("img", { name: "대표펫" })).toBeTruthy();
  });
});
