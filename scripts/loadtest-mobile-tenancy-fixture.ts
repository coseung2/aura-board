import { createHash } from "node:crypto";

import { BoardCategory, Prisma, PrismaClient } from "@prisma/client";

import {
  createPasswordHash,
  isValidAccountPassword,
  isValidPasswordUsername,
  localPrincipalEmail,
  normalizePasswordUsername,
} from "../src/lib/password-credential-core";

const db = new PrismaClient();
const env = process.env;

function required(name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function assertSafeDatabaseTarget(databaseUrl: string): void {
  const target = new URL(databaseUrl);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(target.hostname) && env.LOADTEST_FIXTURE_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Refusing to seed non-local database host ${target.hostname}; set LOADTEST_FIXTURE_ALLOW_REMOTE=1 only for an approved synthetic target`,
    );
  }
}

async function main() {
  const databaseUrl = required("DATABASE_URL");
  assertSafeDatabaseTarget(databaseUrl);

  const runId = required("LOADTEST_RUN_ID");
  if (!/^[a-z0-9][a-z0-9-]{5,95}$/i.test(runId)) {
    throw new Error("LOADTEST_RUN_ID must be 6-96 alphanumeric/hyphen characters");
  }

  const teacherUsername = normalizePasswordUsername(required("LOADTEST_TEACHER_USERNAME"));
  const teacherPassword = required("LOADTEST_TEACHER_PASSWORD");
  if (!isValidPasswordUsername(teacherUsername)) {
    throw new Error("LOADTEST_TEACHER_USERNAME is invalid");
  }
  if (!isValidAccountPassword(teacherPassword)) {
    throw new Error("LOADTEST_TEACHER_PASSWORD must be 8-72 characters");
  }

  const classroomOffset = integerEnv("LOADTEST_CLASSROOM_OFFSET", 0, 0, 999);
  const classroomsCount = integerEnv("LOADTEST_CLASSROOMS", 50, 1, 100);
  const studentsPerClass = integerEnv("LOADTEST_STUDENTS_PER_CLASS", 20, 1, 100);
  const studentCodePrefix = (env.LOADTEST_STUDENT_CODE_PREFIX ?? "X8").trim().toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(studentCodePrefix)) {
    throw new Error("LOADTEST_STUDENT_CODE_PREFIX must be exactly two alphanumeric characters");
  }

  const finalGlobalIndex =
    (classroomOffset + classroomsCount - 1) * studentsPerClass + studentsPerClass - 1;
  if (finalGlobalIndex > 9_999) {
    throw new Error("Fixture naming supports at most four-digit global student indexes");
  }

  const teacherEmail = localPrincipalEmail(teacherUsername);
  const teacherId = `loadtest-teacher-${createHash("sha256")
    .update(teacherUsername)
    .digest("hex")
    .slice(0, 16)}`;
  const passwordHash = await createPasswordHash(teacherPassword);
  const teacher = await db.user.upsert({
    where: { email: teacherEmail },
    create: {
      id: teacherId,
      email: teacherEmail,
      name: "모바일 부하 테스트 교사",
    },
    update: { name: "모바일 부하 테스트 교사" },
    select: { id: true, email: true },
  });
  await db.passwordCredential.upsert({
    where: { username: teacherUsername },
    create: {
      username: teacherUsername,
      passwordHash,
      principalEmail: teacher.email,
    },
    update: {
      passwordHash,
      principalEmail: teacher.email,
    },
  });

  const classroomRows: Prisma.ClassroomCreateManyInput[] = [];
  const currencyRows: Prisma.ClassroomCurrencyCreateManyInput[] = [];
  const studentRows: Prisma.StudentCreateManyInput[] = [];
  const accountRows: Prisma.StudentAccountCreateManyInput[] = [];
  const transactionRows: Prisma.TransactionCreateManyInput[] = [];
  const slimeRows: Prisma.StudentSlimeCreateManyInput[] = [];
  const boardRows: Prisma.BoardCreateManyInput[] = [];
  const memberRows: Prisma.BoardMemberCreateManyInput[] = [];
  const promptRows: Prisma.CardCreateManyInput[] = [];
  const classroomCodeSalt = createHash("sha256").update(runId).digest("hex")[0]?.toUpperCase() ?? "0";

  for (let localClass = 0; localClass < classroomsCount; localClass += 1) {
    const classIndex = classroomOffset + localClass;
    const classSuffix = pad(classIndex, 2);
    const classroomId = `${runId}-class-${classSuffix}`;
    const boardId = `${runId}-board-${classSuffix}`;
    const shadowBoardId = `${runId}-shadow-${classSuffix}`;
    const omokBoardId = `${runId}-omok-${classSuffix}`;

    classroomRows.push({
      id: classroomId,
      code: `L${classroomCodeSalt}${pad(classIndex, 4)}`,
      name: `모바일 부하 ${classIndex + 1}반`,
      teacherId: teacher.id,
    });
    currencyRows.push({ classroomId, unitLabel: "코인" });

    boardRows.push(
      {
        id: boardId,
        slug: boardId,
        title: `모바일 부하 게시판 ${classIndex + 1}`,
        description: "1,000명 모바일 혼합 부하 테스트",
        layout: "freeform",
        category: BoardCategory.LESSON,
        classroomId,
      },
      {
        id: shadowBoardId,
        slug: shadowBoardId,
        title: `그림자연합 부하 ${classIndex + 1}`,
        description: "1,000명 그림자연합 부하 테스트",
        layout: "shadow-alliance",
        category: BoardCategory.PLAY,
        classroomId,
        systemGameKind: "shadow-alliance",
      },
      {
        id: omokBoardId,
        slug: omokBoardId,
        title: `오목 로비 부하 ${classIndex + 1}`,
        description: "1,000명 오목 매칭 부하 테스트",
        layout: "omok",
        category: BoardCategory.PLAY,
        classroomId,
        systemGameKind: "omok",
      },
    );

    for (const [kind, currentBoardId] of [
      ["board", boardId],
      ["shadow", shadowBoardId],
      ["omok", omokBoardId],
    ] as const) {
      memberRows.push({
        id: `${runId}-member-${kind}-${classSuffix}`,
        boardId: currentBoardId,
        userId: teacher.id,
        role: "owner",
      });
    }

    promptRows.push({
      id: `${runId}-prompt-${classSuffix}`,
      boardId,
      authorId: teacher.id,
      title: "오늘 수업 의견",
      content: "부하 테스트 댓글 대상 카드",
      order: 0,
    });

    for (let studentIndex = 0; studentIndex < studentsPerClass; studentIndex += 1) {
      const globalIndex = classIndex * studentsPerClass + studentIndex;
      const studentSuffix = pad(globalIndex, 4);
      const studentId = `${runId}-student-${studentSuffix}`;
      const accountId = `${runId}-account-${studentSuffix}`;
      const transactionId = `${runId}-slime-txn-${studentSuffix}`;

      studentRows.push({
        id: studentId,
        classroomId,
        number: studentIndex + 1,
        name: `${classIndex + 1}반 학생 ${studentIndex + 1}`,
        qrToken: `${runId}-qr-${studentSuffix}`,
        textCode: `${studentCodePrefix}${studentSuffix}`,
      });
      accountRows.push({
        id: accountId,
        classroomId,
        studentId,
        balance: 10_000,
      });
      transactionRows.push({
        id: transactionId,
        accountId,
        type: "slime_purchase",
        amount: 0,
        balanceAfter: 10_000,
        note: "synthetic mobile load-test slime",
        sourceType: "loadtest_slime_purchase",
        sourceRef: `${runId}:${studentSuffix}`,
        performedById: studentId,
        performedByKind: "system",
      });
      slimeRows.push({
        id: `${runId}-slime-${studentSuffix}`,
        studentId,
        classroomId,
        color: "blue",
        isEquipped: true,
        isRepresentative: true,
        purchaseTransactionId: transactionId,
      });
    }
  }

  const inserted = {
    classrooms: (await db.classroom.createMany({ data: classroomRows, skipDuplicates: true })).count,
    currencies: (await db.classroomCurrency.createMany({ data: currencyRows, skipDuplicates: true }))
      .count,
    students: (await db.student.createMany({ data: studentRows, skipDuplicates: true })).count,
    accounts: (await db.studentAccount.createMany({ data: accountRows, skipDuplicates: true })).count,
    transactions: (
      await db.transaction.createMany({ data: transactionRows, skipDuplicates: true })
    ).count,
    slimes: (await db.studentSlime.createMany({ data: slimeRows, skipDuplicates: true })).count,
    boards: (await db.board.createMany({ data: boardRows, skipDuplicates: true })).count,
    members: (await db.boardMember.createMany({ data: memberRows, skipDuplicates: true })).count,
    prompts: (await db.card.createMany({ data: promptRows, skipDuplicates: true })).count,
  };

  const verified = {
    classrooms: await db.classroom.count({ where: { id: { startsWith: `${runId}-class-` } } }),
    students: await db.student.count({ where: { id: { startsWith: `${runId}-student-` } } }),
    boards: await db.board.count({ where: { id: { startsWith: `${runId}-` } } }),
    prompts: await db.card.count({ where: { id: { startsWith: `${runId}-prompt-` } } }),
    accounts: await db.studentAccount.count({ where: { id: { startsWith: `${runId}-account-` } } }),
    slimes: await db.studentSlime.count({ where: { id: { startsWith: `${runId}-slime-` } } }),
  };

  const expectedStudents = classroomsCount * studentsPerClass;
  if (
    verified.classrooms !== classroomsCount ||
    verified.students !== expectedStudents ||
    verified.boards !== classroomsCount * 3 ||
    verified.prompts !== classroomsCount ||
    verified.accounts !== expectedStudents ||
    verified.slimes !== expectedStudents
  ) {
    throw new Error(`Fixture verification failed: ${JSON.stringify(verified)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      teacherUsername,
      classroomOffset,
      classrooms: classroomsCount,
      studentsPerClass,
      actors: expectedStudents,
      inserted,
      verified,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "fixture provisioning failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
