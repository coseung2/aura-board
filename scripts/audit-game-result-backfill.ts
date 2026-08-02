import { db } from "../src/lib/db";
import { writeGameResult } from "../src/lib/game-platform/result-writer";

type Options = {
  apply: boolean;
  environment: string | null;
  limit: number;
};

type AuditRow = {
  attemptId: string;
  studentId: string | null;
  boardId: string | null;
  classification: "safe" | "unsafe" | "existing" | "written";
  reasons: string[];
};

function parseOptions(argv: readonly string[]): Options {
  const apply = argv.includes("--apply");
  const environmentArg = argv.find((value) => value.startsWith("--environment="));
  const limitArg = argv.find((value) => value.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : 500;
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 5_000) {
    throw new Error("--limit must be an integer between 1 and 5000");
  }
  return {
    apply,
    environment: environmentArg?.slice("--environment=".length) ?? null,
    limit: parsedLimit,
  };
}

function assertApplyAllowed(options: Options) {
  if (!options.apply) return;
  if (options.environment !== "staging") {
    throw new Error("writes require --environment=staging");
  }
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    throw new Error("production game-result backfill is prohibited");
  }
  if (process.env.GAME_RESULT_BACKFILL_CONFIRM !== "APPLY_STAGING_GAME_RESULTS") {
    throw new Error(
      "writes require GAME_RESULT_BACKFILL_CONFIRM=APPLY_STAGING_GAME_RESULTS",
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertApplyAllowed(options);

  const attempts = await db.kordleAttempt.findMany({
    where: {
      status: { in: ["WON", "LOST"] },
      completedAt: { not: null },
      studentId: { not: null },
    },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    take: options.limit,
    include: {
      student: { select: { id: true, classroomId: true } },
      guesses: { select: { id: true } },
      puzzle: {
        include: {
          game: {
            include: {
              board: {
                select: { id: true, classroomId: true, layout: true },
              },
            },
          },
        },
      },
    },
  });

  const rows: AuditRow[] = [];
  for (const attempt of attempts) {
    const board = attempt.puzzle.game.board;
    const studentId = attempt.studentId;
    const completedAt = attempt.completedAt;
    const reasons: string[] = [];

    if (!studentId || !attempt.student) reasons.push("missing_student_identity");
    if (!completedAt) reasons.push("missing_completion_time");
    if (!board.classroomId) reasons.push("missing_board_classroom");
    if (board.layout !== "kordle") reasons.push("board_layout_mismatch");
    if (attempt.student?.classroomId !== board.classroomId) {
      reasons.push("student_classroom_mismatch");
    }
    if (completedAt && completedAt < attempt.startedAt) {
      reasons.push("completion_precedes_start");
    }
    if (attempt.puzzle.game.maxGuesses < 1 || attempt.puzzle.game.maxGuesses > 100) {
      reasons.push("invalid_max_guesses");
    }
    if (attempt.puzzle.game.wordLength < 1 || attempt.puzzle.game.wordLength > 64) {
      reasons.push("invalid_word_length");
    }
    if (attempt.guesses.length > 100) reasons.push("invalid_guess_count");

    if (reasons.length > 0 || !studentId || !completedAt) {
      rows.push({
        attemptId: attempt.id,
        studentId,
        boardId: board.id,
        classification: "unsafe",
        reasons,
      });
      continue;
    }

    const safeStudentId = studentId as string;
    const safeClassroomId = board.classroomId as string;
    const safeCompletedAt = completedAt as Date;
    const idempotencyKey = `kordle:${attempt.id}:${safeStudentId}`;
    const existing = await db.gameResult.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      rows.push({
        attemptId: attempt.id,
        studentId,
        boardId: board.id,
        classification: "existing",
        reasons: [],
      });
      continue;
    }

    if (!options.apply) {
      rows.push({
        attemptId: attempt.id,
        studentId,
        boardId: board.id,
        classification: "safe",
        reasons: [],
      });
      continue;
    }

    await db.$transaction((tx) =>
      writeGameResult(tx, {
        gameKind: "kordle",
        boardId: board.id,
        classroomId: safeClassroomId,
        studentId: safeStudentId,
        sourceType: "kordle_attempt",
        sourceId: attempt.id,
        outcome: attempt.status === "WON" ? "win" : "loss",
        metrics: {
          guessesUsed: attempt.guesses.length,
          maxGuesses: attempt.puzzle.game.maxGuesses,
          wordLength: attempt.puzzle.game.wordLength,
          solved: attempt.status === "WON",
          reason: attempt.status === "WON" ? "solved" : "guesses_exhausted",
        },
        startedAt: attempt.startedAt,
        completedAt: safeCompletedAt,
        idempotencyKey,
      }),
    );
    rows.push({
      attemptId: attempt.id,
      studentId,
      boardId: board.id,
      classification: "written",
      reasons: [],
    });
  }

  const counts = rows.reduce<Record<AuditRow["classification"], number>>(
    (summary, row) => {
      summary[row.classification] += 1;
      return summary;
    },
    { safe: 0, unsafe: 0, existing: 0, written: 0 },
  );

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        environment: options.environment,
        scanned: attempts.length,
        counts,
        rows,
        excludedSources: ["legacy SpeedGameAnswer", "browser Shadow Alliance"],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "game-result audit failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
