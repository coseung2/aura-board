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

const ROUND_REWARD_POOL = 10_000;

type SubmittedTeamStats = {
  players: ShadowAlliancePlayer[];
  sum: bigint;
  count: bigint;
  distanceNumerator: bigint;
};

function submittedTeamStats(
  players: ShadowAlliancePlayer[],
  team: ShadowAllianceTeam,
  command: bigint,
): SubmittedTeamStats {
  const submitted = players.filter(
    (player) => player.team === team && player.number !== null,
  );
  const sum = submitted.reduce(
    (total, player) => total + BigInt(player.number as number),
    0n,
  );
  const count = BigInt(submitted.length);
  const distanceNumerator =
    count === 0n ? 0n : absBigInt(sum - command * count);
  return { players: submitted, sum, count, distanceNumerator };
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function compareRationalDistances(
  left: SubmittedTeamStats,
  right: SubmittedTeamStats,
): number {
  const leftCrossProduct = left.distanceNumerator * right.count;
  const rightCrossProduct = right.distanceNumerator * left.count;
  if (leftCrossProduct === rightCrossProduct) return 0;
  return leftCrossProduct < rightCrossProduct ? -1 : 1;
}

function comparePlayerIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function allocateShadowAllianceRewards(
  winners: ShadowAlliancePlayer[],
): Record<string, number> {
  const gains: Record<string, number> = {};
  const total = winners.reduce(
    (sum, player) => sum + BigInt(player.number as number),
    0n,
  );
  if (total <= 0n) return gains;

  const allocations = winners.map((player) => {
    const numerator = BigInt(ROUND_REWARD_POOL) * BigInt(player.number as number);
    return {
      player,
      floorShare: numerator / total,
      remainder: numerator % total,
    };
  });
  const allocated = allocations.reduce(
    (sum, allocation) => sum + allocation.floorShare,
    0n,
  );
  const remaining = Number(BigInt(ROUND_REWARD_POOL) - allocated);

  allocations.sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return comparePlayerIds(left.player.id, right.player.id);
  });

  allocations.forEach((allocation, index) => {
    gains[allocation.player.id] =
      Number(allocation.floorShare) + (index < remaining ? 1 : 0);
  });
  return gains;
}

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
  const commandInteger = BigInt(command);
  const blackStats = submittedTeamStats(players, "black", commandInteger);
  const whiteStats = submittedTeamStats(players, "white", commandInteger);
  const black = blackStats.players;
  const white = whiteStats.players;
  const blackAvg = blackStats.count
    ? Number(blackStats.sum) / Number(blackStats.count)
    : null;
  const whiteAvg = whiteStats.count
    ? Number(whiteStats.sum) / Number(whiteStats.count)
    : null;
  const distanceComparison =
    blackStats.count > 0n && whiteStats.count > 0n
      ? compareRationalDistances(blackStats, whiteStats)
      : null;
  const winner =
    blackStats.count === 0n && whiteStats.count === 0n
      ? "tie"
      : blackStats.count === 0n
        ? "white"
        : whiteStats.count === 0n
          ? "black"
          : distanceComparison === 0
            ? "tie"
            : distanceComparison === -1
              ? "black"
              : "white";
  const gains: Record<string, number> = Object.fromEntries(
    players.map((player) => [player.id, 0]),
  );
  if (winner !== "tie") {
    const winners = winner === "black" ? black : white;
    Object.assign(gains, allocateShadowAllianceRewards(winners));
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
