// src/lib/speed-game/runtime.ts
//
// 스피드게임 런타임 라우트(/api/speed-game/games/[gameId]/*)에서 공통으로
// 쓰는 권한/조회/스코어 헬퍼. DTO 빌더도 같이 둬서 wire shape가 일관되게
// 유지되도록 한다.

import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import {
  buildLeaderboard,
  deserializeKeywords,
  parseBonusRanks,
  rankCorrectAnswers,
  type AnswerForLeaderboard,
} from "./score";

export type GameRuntimeAuth =
  | {
      kind: "teacher";
      userId: string;
      role: "owner" | "editor" | "viewer";
    }
  | { kind: "student"; studentId: string; classroomId: string }
  | { kind: "unauthorized" };

export async function authenticateGameViewer(
  boardId: string,
): Promise<GameRuntimeAuth> {
  // 1순위: 학생 세션(쿠키/Bearer) — 단, 선생 세션이 있으면 학생 무시.
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    const role = await getBoardRole(boardId, user.id);
    if (role) {
      return { kind: "teacher", userId: user.id, role };
    }
  }
  const student = await getCurrentStudent();
  if (student) {
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true },
    });
    if (board?.classroomId && board.classroomId === student.classroomId) {
      return {
        kind: "student",
        studentId: student.id,
        classroomId: student.classroomId,
      };
    }
  }
  return { kind: "unauthorized" };
}

// 스피드게임의 groupId 는 board default groups 의 id 와 1:1 매칭.
// 학생이 속한 모둠 ID 를 보드 default group 에서 찾는다. 없으면 null.
export async function resolveStudentGroupId(
  boardId: string,
  studentId: string,
): Promise<string | null> {
  const boardDefault = await db.boardDefaultGroupMember.findFirst({
    where: { boardId, studentId },
    select: { groupId: true },
  });
  if (boardDefault) return boardDefault.groupId;
  // 폴백: classroom default groups 사용.
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { classroomId: true },
  });
  if (!board?.classroomId) return null;
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { classroomId: true },
  });
  if (!student || student.classroomId !== board.classroomId) return null;
  const classroomDefault = await db.classroomDefaultGroupMember.findFirst({
    where: { classroomId: board.classroomId, studentId },
    select: { groupId: true },
  });
  return classroomDefault?.groupId ?? null;
}

export type GameSnapshot = {
  // 프론트엔드 (src/components/speed-game/types.ts) SpeedGameWire 호환.
  // 백엔드 필드(gameId/bonusRanks/...)는 직렬화 직전에 gameId→id,
  // lobby/running→waiting/active 매핑을 거친다.
  id: string;
  boardId: string;
  boardSlug: string;
  classroomId: string;
  // "waiting" | "active" | "finished"
  status: "waiting" | "active" | "finished";
  roundIndex: number;
  // "exact" | "normalize-space" | "teacher-approval"
  answerMode: "exact" | "normalize-space" | "teacher-approval";
  baseScore: number;
  minScore: number;
  bonusRanks: number[];
  timeLimitMs: number;
  rounds: Array<{
    id: string;
    order: number;
    keyword: string;
    guesserSlot: number;
    startedAt: string | null;
    endedAt: string | null;
  }>;
  answers: Array<{
    id: string;
    roundId: string;
    groupId: string;
    studentId: string;
    // 프론트는 answer / correct: boolean|null / rank / score 필드 사용.
    answer: string;
    correct: boolean | null;
    rank: number | null;
    score: number | null;
    elapsedMs: number;
    createdAt: string;
  }>;
  groups: Array<{
    id: string;
    name: string;
    studentIds: string[];
  }>;
  leaderboard: Array<{
    groupId: string;
    groupName: string;
    score: number;
  }>;
};

// wire DTO 빌더. 프론트엔드 (src/components/speed-game/types.ts) 의
// SpeedGameWire 호환 shape 으로 직렬화한다. 학생 호출자도 active 키워드를
// 받지만 UI 측에서 guesser 가리면 충분 (brief).
export async function loadGameSnapshot(
  gameId: string,
): Promise<GameSnapshot | null> {
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      roundIndex: true,
      answerMode: true,
      baseScore: true,
      minScore: true,
      bonusRanks: true,
      timeLimitMs: true,
      boardId: true,
      board: {
        select: { id: true, slug: true, classroomId: true },
      },
      rounds: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          keyword: true,
          guesserSlot: true,
          startedAt: true,
          endedAt: true,
        },
      },
    },
  });
  if (!game) return null;

  const answers = await db.speedGameAnswer.findMany({
    where: { round: { gameId: game.id } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      roundId: true,
      groupId: true,
      studentId: true,
      correct: true,
      score: true,
      rawText: true,
      elapsedMs: true,
      createdAt: true,
    },
  });

  // 그룹: board default groups 우선, 없으면 classroom default groups 폴백.
  let groupsData: Array<{
    id: string;
    name: string;
    studentIds: string[];
  }> = [];
  if (game.board.classroomId) {
    const boardGroups = await db.boardDefaultGroup.findMany({
      where: { boardId: game.board.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        members: {
          orderBy: { order: "asc" },
          select: { studentId: true },
        },
      },
    });
    if (boardGroups.length > 0) {
      groupsData = boardGroups.map((g) => ({
        id: g.id,
        name: g.name,
        studentIds: g.members.map((m) => m.studentId),
      }));
    } else {
      const classGroups = await db.classroomDefaultGroup.findMany({
        where: { classroomId: game.board.classroomId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          members: {
            orderBy: { order: "asc" },
            select: { studentId: true },
          },
        },
      });
      groupsData = classGroups.map((g) => ({
        id: g.id,
        name: g.name,
        studentIds: g.members.map((m) => m.studentId),
      }));
    }
  }

  // score.ts 의 rankCorrectAnswers 가 같은 라운드에서 accepted correct
  // 답들 사이의 rank 를 계산해 준다. 정답이 아닌 답은 rank/score null.
  const answerRanks = new Map<string, { rank: number; elapsedMs: number }>();
  const answersByRound = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = answersByRound.get(answer.roundId) ?? [];
    list.push(answer);
    answersByRound.set(answer.roundId, list);
  }
  for (const roundAnswers of answersByRound.values()) {
    const ranked = rankCorrectAnswers(
      roundAnswers.map((a) => ({
        answerId: a.id,
        createdAt: a.createdAt,
        correct: a.correct,
      })),
    );
    for (const [answerId, rank] of ranked.entries()) {
      answerRanks.set(answerId, rank);
    }
  }

  const leaderboardRaw = buildLeaderboard(
    answers.map<AnswerForLeaderboard>((a) => ({
      answerId: a.id,
      groupId: a.groupId,
      studentId: a.studentId,
      correct: a.correct,
      score: a.score,
      createdAt: a.createdAt,
    })),
  );
  const groupNameById = new Map(groupsData.map((g) => [g.id, g.name]));

  // status: lobby/running → waiting/active 매핑.
  const wireStatus: GameSnapshot["status"] =
    game.status === "running"
      ? "active"
      : game.status === "lobby"
        ? "waiting"
        : "finished";

  // answerMode: schema 는 exact/teacher-approval 만 둘 수 있지만, 프론트는
  // normalize-space 도 알고 있다. unknown 값은 exact 로 폴백.
  const wireAnswerMode: GameSnapshot["answerMode"] =
    game.answerMode === "teacher-approval"
      ? "teacher-approval"
      : game.answerMode === "normalize-space"
        ? "normalize-space"
        : "exact";

  return {
    id: game.id,
    boardId: game.board.id,
    boardSlug: game.board.slug,
    classroomId: game.board.classroomId ?? "",
    status: wireStatus,
    roundIndex: game.roundIndex,
    answerMode: wireAnswerMode,
    baseScore: game.baseScore,
    minScore: game.minScore,
    bonusRanks: parseBonusRanks(game.bonusRanks),
    timeLimitMs: game.timeLimitMs,
    rounds: game.rounds.map((r) => ({
      id: r.id,
      order: r.order,
      keyword: r.keyword,
      guesserSlot: r.guesserSlot,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    })),
    answers: answers.map((a) => {
      const ranked = answerRanks.get(a.id);
      const isCorrect = a.correct;
      return {
        id: a.id,
        roundId: a.roundId,
        groupId: a.groupId,
        studentId: a.studentId,
        answer: a.rawText,
        correct: isCorrect,
        rank: isCorrect ? ranked?.rank ?? null : null,
        score: a.score,
        elapsedMs: a.elapsedMs,
        createdAt: a.createdAt.toISOString(),
      };
    }),
    groups: groupsData,
    leaderboard: leaderboardRaw.map((e) => ({
      groupId: e.groupId,
      groupName: groupNameById.get(e.groupId) ?? "",
      score: e.score,
    })),
  };
}

// score.ts 에서 한 번 더 export 하기 위함 — keep here to avoid circular
// import. (loadKeywords 보다는 deserializeKeywords 를 직접 import 권장)
export { deserializeKeywords };
