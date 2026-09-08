import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SongGuessAnswer } from "../../../apps/mobile/components/song-guess/SongGuessAnswer";
import {
  isSongGuessSnapshot,
  isSongGuessIntent,
  makeSongGuessCommand,
  mergeSongGuessSnapshot,
  type SongGuessSnapshot,
} from "../../../apps/mobile/lib/song-guess-contract";

vi.mock("../../../apps/mobile/node_modules/react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  Text: ({ children }: { children: React.ReactNode }) => createElement("span", null, children),
}));
vi.mock("../../../apps/mobile/components/ui", () => ({
  AppButton: ({ children, disabled, accessibilityLabel, accessibilityState }: {
    children: React.ReactNode; disabled?: boolean; accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
  }) => createElement("button", {
    disabled, "aria-label": accessibilityLabel, "aria-pressed": accessibilityState?.selected,
  }, children),
  TextField: ({ value, editable }: { value: string; editable: boolean }) =>
    createElement("input", { defaultValue: value, disabled: !editable }),
}));

function snapshot(
  overrides: Partial<SongGuessSnapshot> = {},
): SongGuessSnapshot {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "song-guess",
    version: 3,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    phase: "guessing",
    currentRound: {
      roundId: "round-1",
      order: 0,
      accessibilityClue: "가사가 없는 구간",
      revealedAnswer: null,
      currentClip: {
        assetId: "clip-500",
        tierMs: 500,
        mimeType: "audio/wav",
        durationMs: 500,
        sizeBytes: 44_144,
      },
    },
    participants: [
      { displayName: "학생", score: 0, scoredCurrentRound: false },
    ],
    viewer: { role: "participant", scoredCurrentRound: false },
    ...overrides,
  };
}

function v2Snapshot(
  overrides: Partial<SongGuessSnapshot> = {},
): SongGuessSnapshot {
  const base = snapshot();
  return {
    ...base,
    rulesVersion: 2,
    stateSchemaVersion: 2,
    currentRound: {
      ...base.currentRound,
      startedAtMs: 1_000,
      deadlineAtMs: 31_000,
      maxScore: 1_000,
      ...overrides.currentRound,
    },
    ...overrides,
  };
}

describe("mobile song guess contract", () => {
  it.each(["title", "artist", "artist-title"] as const)("retains the persisted %s answer target", (answerTarget) => {
    expect(isSongGuessSnapshot({ ...snapshot(), answerTarget })).toBe(true);
  });
  it("rejects an unknown answer target", () => {
    expect(isSongGuessSnapshot({ ...snapshot(), answerTarget: "other" })).toBe(false);
  });
  function multipleChoiceSnapshot(): SongGuessSnapshot {
    const current = v2Snapshot();
    return {
      ...current,
      answerMode: "multiple-choice",
      currentRound: {
        ...current.currentRound,
        choices: ["봄", "여름", "가을", "겨울"].map((label, index) => ({
          id: `choice-${index + 1}`, label,
        })),
      },
      viewer: { ...current.viewer, answeredCurrentRound: false, selectedChoiceId: null },
    };
  }

  function renderAnswer(current: SongGuessSnapshot, overrides = {}) {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(SongGuessAnswer, {
      snapshot: current, canGuess: true, busy: false, blocked: false,
      guess: "", onGuessChange: () => {}, onSubmit: () => {}, ...overrides,
    }));
    return container;
  }

  it("renders four numbered accessible choices without a text input", () => {
    const container = renderAnswer(multipleChoiceSnapshot());
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(4);
    expect(container.querySelector("input")).toBeNull();
    buttons.forEach((button, index) => {
      expect(button.getAttribute("aria-label")).toContain(`${index + 1}번`);
      expect(button.disabled).toBe(false);
    });
  });

  it.each([{ busy: true }, { blocked: true }, { canGuess: false }])(
    "locks all choices while busy, syncing, expired or scored: %j", (overrides) => {
      const container = renderAnswer(multipleChoiceSnapshot(), overrides);
      expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    },
  );

  it("renders a persisted wrong submission as selected and prevents another choice", () => {
    const current = multipleChoiceSnapshot();
    current.viewer = { ...current.viewer, answeredCurrentRound: true, selectedChoiceId: "choice-2" };
    const container = renderAnswer(JSON.parse(JSON.stringify(current)));
    expect(container.textContent).toContain("제출한 답: 여름");
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect([...container.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  });

  it("labels the revealed correct choice separately from a persisted wrong selection", () => {
    const current = multipleChoiceSnapshot();
    current.phase = "reveal";
    current.currentRound.currentClip = null;
    current.currentRound.revealedAnswer = "봄";
    current.viewer = { ...current.viewer, answeredCurrentRound: true, selectedChoiceId: "choice-2" };
    const container = renderAnswer(current);
    const labels = [...container.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
    expect(labels).toContain("1번, 봄, 정답");
    expect(labels).toContain("2번, 여름, 제출한 오답");
    expect(container.textContent).toContain("선택한 답이 오답이에요.");
  });

  it("retains text entry for absent or explicit text mode", () => {
    for (const current of [snapshot(), snapshot({ answerMode: "text" })]) {
      const container = renderAnswer(current);
      expect(container.querySelector("input")).not.toBeNull();
      expect(container.querySelectorAll("button")).toHaveLength(1);
    }
  });

  it("accepts absent and explicit text modes without requiring choices", () => {
    expect(isSongGuessSnapshot(v2Snapshot())).toBe(true);
    expect(isSongGuessSnapshot(v2Snapshot({ answerMode: "text" }))).toBe(true);
    expect(isSongGuessSnapshot({ ...v2Snapshot(), answerMode: "unknown" })).toBe(false);
  });

  it("preserves the viewer's submitted choice after a serialized refresh and reveal", () => {
    const current = multipleChoiceSnapshot();
    expect(isSongGuessSnapshot(current)).toBe(true);
    current.viewer.answeredCurrentRound = true;
    current.viewer.selectedChoiceId = "choice-2";
    const refreshed = JSON.parse(JSON.stringify(current));
    expect(isSongGuessSnapshot(refreshed)).toBe(true);
    expect(mergeSongGuessSnapshot(current, current.sessionId, refreshed)?.viewer)
      .toMatchObject({ answeredCurrentRound: true, selectedChoiceId: "choice-2", scoredCurrentRound: false });
    current.phase = "reveal";
    current.currentRound.currentClip = null;
    current.currentRound.revealedAnswer = "봄";
    expect(isSongGuessSnapshot(current)).toBe(true);
  });

  it.each(["guessing", "reveal", "finished"] as const)("requires exactly four choices during %s", (phase) => {
    const current = multipleChoiceSnapshot();
    current.phase = phase;
    if (phase !== "guessing") {
      current.currentRound.currentClip = null;
      current.currentRound.revealedAnswer = "봄";
    }
    expect(isSongGuessSnapshot(current)).toBe(true);
    for (const choices of [undefined, null, [], current.currentRound.choices!.slice(0, 3),
      [...current.currentRound.choices!, { id: "fifth", label: "다섯" }]]) {
      expect(isSongGuessSnapshot({ ...current, currentRound: { ...current.currentRound, choices } })).toBe(false);
    }
  });

  it.each([undefined, "text"] as const)("rejects choices in %s answer mode", (answerMode) => {
    const current = multipleChoiceSnapshot();
    for (const choices of [current.currentRound.choices, [], null]) {
      expect(isSongGuessSnapshot({ ...current, answerMode,
        currentRound: { ...current.currentRound, choices } })).toBe(false);
    }
  });

  it.each(["draft", "lobby"] as const)("rejects choices in the %s phase", (phase) => {
    const current = multipleChoiceSnapshot();
    current.phase = phase;
    current.currentRound = {
      ...current.currentRound, currentClip: null, accessibilityClue: null,
      startedAtMs: null, deadlineAtMs: null,
    };
    for (const choices of [current.currentRound.choices, [], null]) {
      expect(isSongGuessSnapshot({ ...current,
        currentRound: { ...current.currentRound, choices } })).toBe(false);
    }
    delete current.currentRound.choices;
    expect(isSongGuessSnapshot(current)).toBe(true);
  });

  it.each([
    { role: "host", answeredCurrentRound: true },
    { role: "participant", answeredCurrentRound: false },
    { role: "participant", answeredCurrentRound: undefined },
  ])("rejects an own selection without participant ownership and an answer: %j", (viewer) => {
    const current = multipleChoiceSnapshot();
    expect(isSongGuessSnapshot({ ...current, viewer: {
      ...current.viewer, ...viewer, selectedChoiceId: "choice-2",
    } })).toBe(false);
  });

  it.each(["host", "participant"] as const)("accepts a nullable selection for %s", (role) => {
    const current = multipleChoiceSnapshot();
    for (const answeredCurrentRound of [undefined, false, true]) {
      expect(isSongGuessSnapshot({ ...current, viewer: {
        ...current.viewer, role, answeredCurrentRound, selectedChoiceId: null,
      } })).toBe(true);
    }
  });

  it.each([
    { selectedChoiceId: "choice-2" }, { selectedChoiceId: null },
    { selectedChoiceId: undefined }, { answeredCurrentRound: true },
    { answeredCurrentRound: false }, { answeredCurrentRound: undefined },
  ])("rejects private answer fields on other participants: %j", (fields) => {
    const current = multipleChoiceSnapshot();
    expect(isSongGuessSnapshot({ ...current, participants: [
      { ...current.participants[0], ...fields },
    ] })).toBe(false);
  });

  it.each(["videoId", "youtubeVideoId", "playbackStartMs", "correctChoiceId", "selections"])(
    "rejects private %s outside choices", (key) => {
      const current = multipleChoiceSnapshot();
      for (const payload of [
        { ...current, [key]: "secret" },
        { ...current, currentRound: { ...current.currentRound, [key]: "secret" } },
        { ...current, viewer: { ...current.viewer, [key]: "secret" } },
        { ...current, participants: [{ ...current.participants[0], [key]: "secret" }] },
      ]) expect(isSongGuessSnapshot(payload)).toBe(false);
    },
  );

  it.each([["여름", "여\u200b름"], ["여름 노래", "여름   노래"]])(
    "rejects labels that normalize to the same answer: %j", (first, second) => {
      const current = multipleChoiceSnapshot();
      current.currentRound.choices![0].label = first;
      current.currentRound.choices![1].label = second;
      expect(isSongGuessSnapshot(current)).toBe(false);
    },
  );

  it("does not require choices in the multiple-choice lobby", () => {
    const current = multipleChoiceSnapshot();
    current.phase = "lobby";
    current.currentRound = {
      ...current.currentRound, choices: undefined, currentClip: null,
      accessibilityClue: null, startedAtMs: null, deadlineAtMs: null,
    };
    expect(isSongGuessSnapshot(current)).toBe(true);
  });

  it.each([
    { id: " ", label: "제목" }, { id: 1, label: "제목" },
    { id: "unique", label: " " }, { id: "unique", label: null },
    { id: "choice-2", label: "중복 ID" }, { id: "unique", label: " 여름 " },
  ])("rejects malformed or duplicate choices: %j", (choice) => {
    const current = multipleChoiceSnapshot();
    const choices = [choice, ...current.currentRound.choices!.slice(1)];
    expect(isSongGuessSnapshot({ ...current, currentRound: { ...current.currentRound, choices } })).toBe(false);
  });

  it.each(["answer", "correct", "isCorrect", "correctChoiceId", "normalizedAnswer", "aliases", "sourceUrl", "objectKey", "revealedAnswer"])(
    "rejects %s leakage in a choice even during reveal", (key) => {
      const current = multipleChoiceSnapshot();
      const choices = current.currentRound.choices!.map((choice) => ({ ...choice, [key]: "secret" }));
      expect(isSongGuessSnapshot({ ...current, currentRound: { ...current.currentRound, choices } })).toBe(false);
      expect(isSongGuessSnapshot({ ...current, phase: "reveal", currentRound: {
        ...current.currentRound, choices, currentClip: null, revealedAnswer: "봄",
      } })).toBe(false);
    },
  );

  it.each([{ answeredCurrentRound: "yes" }, { selectedChoiceId: "" },
    { selectedChoiceId: 4 }, { selectedChoiceId: "missing" }])("rejects invalid viewer selection: %j", (viewer) => {
    const current = multipleChoiceSnapshot();
    expect(isSongGuessSnapshot({ ...current, viewer: { ...current.viewer, ...viewer } })).toBe(false);
  });

  it("creates and validates choice commands for persisted retries without sending text", () => {
    const command = { type: "guess", choiceId: "choice-2", roundId: "round-1" } as const;
    const request = makeSongGuessCommand(multipleChoiceSnapshot(), command);
    expect(JSON.parse(JSON.stringify(request)).command).toEqual(command);
    expect(isSongGuessIntent(request.command)).toBe(true);
    expect(isSongGuessIntent({ type: "guess", text: "legacy" })).toBe(true);
    expect(isSongGuessIntent({ type: "join" })).toBe(true);
    for (const invalid of [
      { type: "guess" }, { ...command, choiceId: " " },
      { ...command, choiceId: 2 }, { ...command, text: "mixed" },
      { ...command, roundId: "" }, { ...command, roundId: 1 },
    ]) expect(isSongGuessIntent(invalid)).toBe(false);
  });

  it("accepts only the currently unlocked clip without hidden answer fields", () => {
    expect(isSongGuessSnapshot(snapshot())).toBe(true);
    expect(isSongGuessSnapshot({ ...snapshot(), futureClips: [] })).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...snapshot(),
        currentRound: {
          ...snapshot().currentRound,
          representativeAnswer: "비밀 정답",
        },
      }),
    ).toBe(false);
  });

  it("keeps v1 snapshots valid when timing fields are absent", () => {
    const legacy = snapshot();
    expect(legacy.rulesVersion).toBe(1);
    expect(legacy.currentRound.startedAtMs).toBeUndefined();
    expect(isSongGuessSnapshot(legacy)).toBe(true);
  });

  it("accepts teacher-only YouTube clips and optional joined/pet projection fields", () => {
    const current = snapshot({
      currentRound: {
        ...snapshot().currentRound,
        currentClip: {
          assetId: "clip-youtube",
          tierMs: 15_000,
          mimeType: "video/youtube",
          durationMs: 15_000,
          sizeBytes: 0,
        },
      },
      participants: [
        {
          displayName: "학생",
          score: 200,
          scoredCurrentRound: true,
          joined: true,
          roundScore: 200,
          previousRank: 2,
          participantId: "student-1",
          representativePet: {
            color: "mint",
            growthStage: 2,
            equippedItemKeys: [],
            hiddenItemKeys: [],
            equippedTitleKey: null,
          },
        },
      ],
      viewer: {
        role: "participant",
        scoredCurrentRound: true,
        joined: true,
        participantIndex: 0,
      },
    });
    expect(isSongGuessSnapshot(current)).toBe(true);
  });

  it("requires a valid server-authored timing window for v2 snapshots", () => {
    const current = v2Snapshot();
    expect(isSongGuessSnapshot(current)).toBe(true);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, startedAtMs: -1 },
      }),
    ).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, deadlineAtMs: 32_000 },
      }),
    ).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, maxScore: 900 },
      }),
    ).toBe(false);
  });

  it("rejects answer leakage before reveal and accepts the revealed answer afterwards", () => {
    expect(
      isSongGuessSnapshot({
        ...snapshot(),
        currentRound: {
          ...snapshot().currentRound,
          revealedAnswer: "노래 제목",
        },
      }),
    ).toBe(false);

    expect(
      isSongGuessSnapshot(
        snapshot({
          phase: "reveal",
          currentRound: {
            ...snapshot().currentRound,
            currentClip: null,
            revealedAnswer: "노래 제목",
          },
        }),
      ),
    ).toBe(true);
  });

  it("keeps accessibility clues out of draft and lobby snapshots", () => {
    expect(
      isSongGuessSnapshot(
        snapshot({
          phase: "lobby",
          currentRound: { ...snapshot().currentRound, currentClip: null },
        }),
      ),
    ).toBe(false);
  });

  it("never rolls back or crosses sessions while merging", () => {
    const current = snapshot({ version: 5 });
    expect(
      mergeSongGuessSnapshot(current, "session-1", snapshot({ version: 4 })),
    ).toBe(current);
    expect(
      mergeSongGuessSnapshot(
        current,
        "session-1",
        snapshot({ sessionId: "session-2", version: 6 }),
      ),
    ).toBe(current);
  });

  it("creates an idempotent request envelope against the visible version", () => {
    const request = makeSongGuessCommand(snapshot({ version: 9 }), {
      type: "guess",
      text: "정답",
      roundId: "round-1",
    });
    expect(request).toMatchObject({
      expectedVersion: 9,
      commandSchemaVersion: 1,
      command: { type: "guess", text: "정답", roundId: "round-1" },
    });
    expect(request.requestId).toMatch(/^song_guess_guess_/);
    const join = makeSongGuessCommand(
      snapshot({
        phase: "lobby",
        currentRound: { ...snapshot().currentRound, currentClip: null },
      }),
      { type: "join" },
    );
    expect(join.command).toEqual({ type: "join" });
    expect(join.requestId).toMatch(/^song_guess_join_/);
  });
});
