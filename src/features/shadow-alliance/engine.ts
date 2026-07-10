import type {
  ShadowAllianceGame,
  ShadowAlliancePlayer,
  ShadowAllianceResult,
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "./types";

const ADJECTIVES = [
  "용감한",
  "신중한",
  "영리한",
  "재빠른",
  "냉철한",
  "대담한",
  "고요한",
  "치밀한",
  "은밀한",
  "침착한",
  "예리한",
  "강인한",
];

const ANIMALS = [
  "늑대",
  "부엉이",
  "여우",
  "치타",
  "표범",
  "매",
  "까마귀",
  "독수리",
  "살쾡이",
  "사자",
  "호랑이",
  "코브라",
];

export function createShadowAllianceGame(): ShadowAllianceGame {
  return {
    phase: "lobby",
    totalRounds: 5,
    round: 0,
    command: null,
    editable: true,
    timerSec: 300,
    timeLeft: 0,
    timerRunning: false,
    players: [],
    usedNicknames: [],
    lastResult: null,
    history: [],
  };
}

export function toShadowAllianceSnapshot(
  game: ShadowAllianceGame,
): ShadowAllianceSnapshot {
  return {
    phase: game.phase,
    totalRounds: game.totalRounds,
    round: game.round,
    command: game.command,
    editable: game.editable,
    timeLeft: game.timeLeft,
    timerRunning: game.timerRunning,
    players: game.players.map(({ number, ...player }) => ({
      ...player,
      submitted: number !== null,
    })),
    lastResult: game.lastResult,
  };
}

function cloneGame(game: ShadowAllianceGame): ShadowAllianceGame {
  return {
    ...game,
    players: game.players.map((player) => ({ ...player })),
    usedNicknames: [...game.usedNicknames],
    history: [...game.history],
  };
}

function nextNickname(usedNicknames: readonly string[]): string {
  const used = new Set(usedNicknames);
  for (let index = 0; index < 500; index += 1) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const nickname = `${adjective} ${animal}`;
    if (!used.has(nickname)) return nickname;
  }
  return `그림자 ${used.size + 1}`;
}

function teamForNewPlayer(players: readonly ShadowAlliancePlayer[]): ShadowAllianceTeam {
  const black = players.filter((player) => player.team === "black").length;
  const white = players.length - black;
  if (black === white) return Math.random() < 0.5 ? "black" : "white";
  return black < white ? "black" : "white";
}

export function addShadowAlliancePlayer(game: ShadowAllianceGame): {
  game: ShadowAllianceGame;
  player: ShadowAlliancePlayer;
} {
  const next = cloneGame(game);
  const nick = nextNickname(next.usedNicknames);
  const player: ShadowAlliancePlayer = {
    id: `agent-${crypto.randomUUID()}`,
    nick,
    team: teamForNewPlayer(next.players),
    power: 0,
    number: null,
    lastGain: 0,
  };
  next.players.push(player);
  next.usedNicknames.push(nick);
  return { game: next, player };
}

export function removeShadowAlliancePlayer(
  game: ShadowAllianceGame,
  playerId: string,
): ShadowAllianceGame {
  const next = cloneGame(game);
  const player = next.players.find((item) => item.id === playerId);
  next.players = next.players.filter((item) => item.id !== playerId);
  if (player) {
    next.usedNicknames = next.usedNicknames.filter((nick) => nick !== player.nick);
  }
  return next;
}

export function rebalanceShadowAllianceTeams(game: ShadowAllianceGame): ShadowAllianceGame {
  const next = cloneGame(game);
  const shuffled = [...next.players].sort(() => Math.random() - 0.5);
  shuffled.forEach((player, index) => {
    player.team = index < Math.ceil(shuffled.length / 2) ? "black" : "white";
  });
  return next;
}

export function setShadowAllianceSettings(
  game: ShadowAllianceGame,
  settings: Partial<Pick<ShadowAllianceGame, "editable" | "timerSec">>,
): ShadowAllianceGame {
  const next = cloneGame(game);
  if (typeof settings.editable === "boolean") next.editable = settings.editable;
  if (typeof settings.timerSec === "number") {
    next.timerSec = settings.timerSec;
    if (next.phase !== "playing") next.timeLeft = settings.timerSec;
  }
  return next;
}

export function startShadowAllianceGame(game: ShadowAllianceGame): ShadowAllianceGame {
  if (game.players.length < 2) return game;
  return nextShadowAllianceRound({
    ...cloneGame(game),
    round: 0,
    players: game.players.map((player) => ({ ...player, power: 0 })),
    history: [],
  });
}

export function nextShadowAllianceRound(game: ShadowAllianceGame): ShadowAllianceGame {
  const next = cloneGame(game);
  if (next.round >= next.totalRounds) {
    next.phase = "final";
    next.timerRunning = false;
    return next;
  }
  next.round += 1;
  next.command = 30 + Math.floor(Math.random() * 41);
  next.players = next.players.map((player) => ({
    ...player,
    number: null,
    lastGain: 0,
  }));
  next.phase = "playing";
  next.timeLeft = next.timerSec;
  next.timerRunning = true;
  next.lastResult = null;
  return next;
}

export function submitShadowAllianceNumber(
  game: ShadowAllianceGame,
  playerId: string,
  number: number,
): ShadowAllianceGame {
  if (game.phase !== "playing") return game;
  const next = cloneGame(game);
  const player = next.players.find((item) => item.id === playerId);
  if (!player || (player.number !== null && !next.editable)) return game;
  player.number = Math.max(1, Math.min(100, Math.round(number)));
  return next;
}

export function tickShadowAllianceTimer(game: ShadowAllianceGame): ShadowAllianceGame {
  if (game.phase !== "playing" || !game.timerRunning || game.timeLeft <= 0) {
    return game;
  }
  const next = cloneGame(game);
  next.timeLeft = Math.max(0, next.timeLeft - 1);
  if (next.timeLeft === 0) next.timerRunning = false;
  return next;
}

export function setShadowAllianceTimerRunning(
  game: ShadowAllianceGame,
  timerRunning: boolean,
): ShadowAllianceGame {
  return { ...cloneGame(game), timerRunning };
}

export function revealShadowAllianceRound(game: ShadowAllianceGame): ShadowAllianceGame {
  const command = game.command;
  if (game.phase !== "playing" || command === null) return game;
  const next = cloneGame(game);
  const result = computeShadowAllianceRound(next.players, command);
  next.players = next.players.map((player) => ({
    ...player,
    lastGain: result.gains[player.id] ?? 0,
    power: player.power + (result.gains[player.id] ?? 0),
  }));
  next.lastResult = result;
  next.history.push(result);
  next.phase = "revealing";
  next.timerRunning = false;
  return next;
}

export function moveShadowAllianceToPostround(
  game: ShadowAllianceGame,
): ShadowAllianceGame {
  if (game.phase !== "revealing") return game;
  return { ...cloneGame(game), phase: "postround" };
}

export function endShadowAllianceGame(game: ShadowAllianceGame): ShadowAllianceGame {
  if (game.phase === "final") return game;
  return { ...cloneGame(game), phase: "final", timerRunning: false };
}

export function resetShadowAllianceGame(): ShadowAllianceGame {
  return createShadowAllianceGame();
}

export function shadowAllianceRankings(game: ShadowAllianceGame): ShadowAlliancePlayer[] {
  return [...game.players].sort((left, right) => right.power - left.power);
}

export function computeShadowAllianceRound(
  players: ShadowAlliancePlayer[],
  command: number,
): ShadowAllianceResult {
  const submitted = (team: ShadowAllianceTeam) =>
    players.filter((player) => player.team === team && player.number !== null);
  const black = submitted("black");
  const white = submitted("white");
  const average = (group: ShadowAlliancePlayer[]) =>
    group.reduce((sum, player) => sum + (player.number ?? 0), 0) / group.length;
  const blackAvg = black.length ? average(black) : null;
  const whiteAvg = white.length ? average(white) : null;
  const winner =
    blackAvg === null && whiteAvg === null
      ? "tie"
      : blackAvg === null
        ? "white"
        : whiteAvg === null
          ? "black"
          : Math.abs(blackAvg - command) === Math.abs(whiteAvg - command)
            ? "tie"
            : Math.abs(blackAvg - command) < Math.abs(whiteAvg - command)
              ? "black"
              : "white";
  const gains: Record<string, number> = Object.fromEntries(
    players.map((player) => [player.id, 0]),
  );
  if (winner !== "tie") {
    const winners = winner === "black" ? black : white;
    const total = winners.reduce((sum, player) => sum + (player.number ?? 0), 0);
    winners.forEach((player) => {
      gains[player.id] = total
        ? Math.round((10_000 * (player.number ?? 0)) / total)
        : 0;
    });
  }
  return {
    command,
    winner,
    blackAvg: blackAvg === null ? null : Number(blackAvg.toFixed(1)),
    whiteAvg: whiteAvg === null ? null : Number(whiteAvg.toFixed(1)),
    blackDiff: blackAvg === null ? null : Number(Math.abs(blackAvg - command).toFixed(1)),
    whiteDiff: whiteAvg === null ? null : Number(Math.abs(whiteAvg - command).toFixed(1)),
    black,
    white,
    gains,
  };
}
