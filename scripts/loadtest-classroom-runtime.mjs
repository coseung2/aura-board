import { encode } from "@auth/core/jwt";
import { createHmac, randomBytes } from "node:crypto";
import {
  authSecret,
  config,
  db,
  exactSyntheticOutboxSources,
  execFileAsync,
  readFile,
  result,
  runId,
  sleep,
  summarizeCommentRewardSettlement,
} from "./loadtest-classroom-context.mjs";

async function createManyBatches(model, data, batchSize = 500) {
  for (let offset = 0; offset < data.length; offset += batchSize) {
    await model.createMany({ data: data.slice(offset, offset + batchSize) });
  }
}

function studentSessionToken(student) {
  const encoded = Buffer.from(
    JSON.stringify({
      studentId: student.id,
      classroomId: student.classroomId,
      sessionVersion: 1,
      exp: Date.now() + 6 * 60 * 60_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", authSecret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function teacherSessionCookie(teacher) {
  // Auth.js selects the secure cookie name from the resolved application URL.
  // A local HTTP target and the production-mode server can disagree, so issue
  // both valid names with their own salt. The server reads only its configured
  // cookie; no browser cookie attributes are needed for this direct HTTP test.
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
  ];
  const pairs = await Promise.all(
    cookieNames.map(async (cookieName) => {
      const token = await encode({
        secret: authSecret,
        salt: cookieName,
        maxAge: 6 * 60 * 60,
        token: {
          id: teacher.id,
          sub: teacher.id,
          email: teacher.email,
          name: teacher.name,
        },
      });
      return `${cookieName}=${token}`;
    }),
  );
  return pairs.join("; ");
}

export async function seedSyntheticClassrooms() {
  const teachers = [];
  const classrooms = [];
  const students = [];
  const accounts = [];
  const studentCards = [];
  const boards = [];
  const boardMembers = [];
  const promptCards = [];
  const studentActors = [];

  const textPrefix = runId.replace(/[^a-z0-9]/gi, "").slice(-2).toUpperCase();
  for (let classIndex = 0; classIndex < config.classrooms; classIndex += 1) {
    const classSuffix = classIndex.toString(36).padStart(3, "0");
    const teacher = {
      id: `${runId}-teacher-${classSuffix}`,
      email: `${runId}-teacher-${classSuffix}@load.invalid`,
      name: `부하 교사 ${classIndex + 1}`,
    };
    const classroom = {
      id: `${runId}-class-${classSuffix}`,
      name: `부하 ${classIndex + 1}반`,
      code: `${runId.replace(/[^a-z0-9]/gi, "").slice(-3)}${classSuffix}`
        .slice(-6)
        .toUpperCase(),
      teacherId: teacher.id,
    };
    const board = {
      id: `${runId}-board-${classSuffix}`,
      slug: `${runId}-board-${classSuffix}`,
      title: `부하 수업 보드 ${classIndex + 1}`,
      layout: "freeform",
      classroomId: classroom.id,
    };
    const prompt = {
      id: `${runId}-prompt-${classSuffix}`,
      boardId: board.id,
      authorId: teacher.id,
      title: "오늘 수업 의견",
      content: "수업에서 알게 된 점을 남겨 주세요.",
      order: 0,
    };

    teachers.push(teacher);
    classrooms.push(classroom);
    boards.push(board);
    promptCards.push(prompt);
    boardMembers.push({
      id: `${runId}-member-${classSuffix}`,
      boardId: board.id,
      userId: teacher.id,
      role: "owner",
    });

    for (let studentIndex = 0; studentIndex < config.studentsPerClass; studentIndex += 1) {
      const globalIndex = classIndex * config.studentsPerClass + studentIndex;
      const studentSuffix = globalIndex.toString(36).padStart(4, "0");
      const student = {
        id: `${runId}-student-${studentSuffix}`,
        classroomId: classroom.id,
        number: studentIndex + 1,
        name: `${classIndex + 1}반 학생 ${studentIndex + 1}`,
        qrToken: `${runId}-qr-${studentSuffix}`,
        textCode: `${textPrefix}${studentSuffix}`.slice(-6).toUpperCase(),
      };
      const accountId = `${runId}-account-${studentSuffix}`;
      students.push(student);
      accounts.push({
        id: accountId,
        classroomId: classroom.id,
        studentId: student.id,
      });
      studentCards.push({
        id: `${runId}-bank-card-${studentSuffix}`,
        accountId,
        cardNumber: `${runId}-${studentSuffix}`,
        qrSecret: randomBytes(24).toString("hex"),
      });
      studentActors.push({
        id: student.id,
        name: student.name,
        classroomId: classroom.id,
        boardId: board.id,
        boardSlug: board.slug,
        promptCardId: prompt.id,
        classIndex,
        studentIndex,
        token: studentSessionToken(student),
      });
    }
  }

  await createManyBatches(db.user, teachers, 100);
  await createManyBatches(db.classroom, classrooms, 100);
  await createManyBatches(db.student, students, 500);
  await createManyBatches(db.studentAccount, accounts, 500);
  await createManyBatches(db.studentCard, studentCards, 500);
  await createManyBatches(db.board, boards, 100);
  await createManyBatches(db.boardMember, boardMembers, 100);
  await createManyBatches(db.card, promptCards, 100);

  const teacherActors = await Promise.all(
    teachers.map(async (teacher, classIndex) => ({
      ...teacher,
      classIndex,
      classroomId: classrooms[classIndex].id,
      boardId: boards[classIndex].id,
      cookie: await teacherSessionCookie(teacher),
    })),
  );

  return {
    teachers,
    classrooms,
    students,
    boards,
    promptCards,
    studentActors,
    teacherActors,
  };
}

export async function readCommentRewardSettlement(commentIds) {
  if (commentIds.length === 0) {
    return summarizeCommentRewardSettlement([], [], [], Date.now());
  }
  const [outboxRows, transactionRows] = await Promise.all([
    db.notificationOutbox.findMany({
      where: { eventType: "comment_reward", sourceId: { in: commentIds } },
      select: { sourceId: true, status: true, createdAt: true },
    }),
    db.transaction.findMany({
      where: { sourceType: "comment_reward", sourceRef: { in: commentIds } },
      select: { id: true, sourceRef: true },
    }),
  ]);
  return {
    ...summarizeCommentRewardSettlement(commentIds, outboxRows, transactionRows, Date.now()),
    transactionIds: transactionRows.map((row) => row.id),
  };
}

export async function settleCommentRewards(commentIds) {
  const started = Date.now();
  let settlement = await readCommentRewardSettlement(commentIds);
  while (
    !settlement.complete &&
    !settlement.dead &&
    Date.now() - started < config.commentRewardSettleTimeoutMs
  ) {
    await sleep(config.commentRewardPollIntervalMs);
    settlement = await readCommentRewardSettlement(commentIds);
  }
  result.commentRewardDelivery = {
    expected: settlement.expected,
    outboxStatusCounts: settlement.outboxStatusCounts,
    completedTransactionCount: settlement.completedTransactionCount,
    durationMs: Date.now() - started,
    complete: settlement.complete,
    oldestOutstandingAgeMs: settlement.oldestOutstandingAgeMs,
  };
  console.log(JSON.stringify({ phase: "comment-reward-settle", ...result.commentRewardDelivery }));
  return settlement.transactionIds ?? [];
}

export async function closeRealtimeChannels(handles) {
  for (let offset = 0; offset < handles.length; offset += 100) {
    await Promise.all(
      handles.slice(offset, offset + 100).map(async ({ client, channel }) => {
        try {
          await client.removeChannel(channel);
        } catch {
          // Best-effort load-test cleanup.
        }
        try {
          client.realtime.disconnect();
        } catch {
          // Best-effort load-test cleanup.
        }
      }),
    );
  }
}

export async function sampleServerProcess(pid) {
  if (!pid) return null;
  if (process.platform === "win32") {
    const script = [
      `$p = Get-Process -Id ${pid} -ErrorAction Stop`,
      "$o = [pscustomobject]@{cpuSeconds=$p.CPU;workingSetBytes=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64;threads=$p.Threads.Count}",
      "$o | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true, timeout: 4_000 },
    );
    return JSON.parse(stdout.trim());
  }

  const [statusText, statText] = await Promise.all([
    readFile(`/proc/${pid}/status`, "utf8"),
    readFile(`/proc/${pid}/stat`, "utf8"),
  ]);
  const rssMatch = statusText.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  const privateMatch = statusText.match(/^RssAnon:\s+(\d+)\s+kB$/m);
  const stat = statText.trim().split(/\s+/);
  const clockTicks = 100;
  return {
    cpuSeconds: (Number(stat[13] ?? 0) + Number(stat[14] ?? 0)) / clockTicks,
    workingSetBytes: Number(rssMatch?.[1] ?? 0) * 1_024,
    privateBytes: Number(privateMatch?.[1] ?? 0) * 1_024,
    threads: Number(stat[19] ?? 0),
  };
}

export function startOperationalSampler() {
  let stopped = false;
  let sampling = false;
  const sample = async () => {
    if (stopped || sampling) return;
    sampling = true;
    const entry = {
      at: new Date().toISOString(),
      generatorRssBytes: process.memoryUsage().rss,
      db: null,
      server: null,
    };
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE state = 'active')::int AS active,
                count(*) FILTER (
                  WHERE state = 'active' AND wait_event IS NOT NULL
                )::int AS waiting,
                count(*) FILTER (
                  WHERE state = 'active' AND wait_event_type = 'Lock'
                )::int AS lock_waiting
           FROM pg_stat_activity
          WHERE datname = current_database()`,
      );
      const row = rows?.[0];
      if (row) {
        entry.db = {
          total: Number(row.total ?? 0),
          active: Number(row.active ?? 0),
          waiting: Number(row.waiting ?? 0),
          lockWaiting: Number(row.lock_waiting ?? 0),
        };
      }
    } catch (error) {
      entry.dbError = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    }
    try {
      entry.server = await sampleServerProcess(config.serverPid);
    } catch (error) {
      entry.serverError = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    }
    result.samples.push(entry);
    sampling = false;
  };

  void sample();
  const timer = setInterval(() => void sample(), config.sampleIntervalMs);
  return async () => {
    clearInterval(timer);
    while (sampling) await sleep(25);
    await sample().catch(() => undefined);
    stopped = true;
  };
}

export function aggregateGate() {
  const operations = [];
  for (const phase of result.phases) {
    for (const [op, summary] of Object.entries(phase.summary ?? {})) {
      operations.push({ phase: phase.name, op, ...summary });
    }
  }
  const requests = operations.reduce((sum, operation) => sum + operation.requests, 0);
  const errors = operations.reduce((sum, operation) => sum + operation.errors, 0);
  const reads = operations.filter((operation) =>
    ["teacher.classrooms", "teacher.snapshot", "student.board-open", "student.snapshot"].includes(
      operation.op,
    ),
  );
  const writes = operations.filter((operation) =>
    ["card.create", "comment.create", "like.create"].includes(operation.op),
  );
  const readP95 = reads.reduce(
    (max, operation) => Math.max(max, Number(operation.p95Ms ?? 0)),
    0,
  );
  const writeP95 = writes.reduce(
    (max, operation) => Math.max(max, Number(operation.p95Ms ?? 0)),
    0,
  );
  const errorRate = requests ? errors / requests : 0;
  const failures = [];
  if (result.fatal) failures.push("fatal");
  if (errorRate > config.maxErrorRate) failures.push("error_rate");
  if (readP95 > config.maxReadP95Ms) failures.push("read_p95");
  if (writeP95 > config.maxWriteP95Ms) failures.push("write_p95");
  if (result.realtime.failed > Math.ceil(config.realtimeClients * config.maxErrorRate)) {
    failures.push("realtime_subscribe");
  }
  if (result.realtime.settle && !result.realtime.settle.complete) {
    failures.push("realtime_delivery");
  }
  if (result.realtime.transportCallbacks.rollingPeakPerSecond > config.realtimeMaxMessageRate) {
    failures.push("realtime_callback_peak");
  }
  if (result.realtime.joinActual && !result.realtime.joinActual.accepted) {

    failures.push("realtime_join_actual");
  }
  if (result.commentRewardDelivery && !result.commentRewardDelivery.complete) {
    failures.push("comment_reward_delivery");
  }

  const serverSamples = result.samples.map((sample) => sample.server).filter(Boolean);
  const dbSamples = result.samples.map((sample) => sample.db).filter(Boolean);
  return {
    passed: failures.length === 0,
    failures,
    requests,
    errors,
    errorRate,
    readP95Ms: readP95,
    writeP95Ms: writeP95,
    maxServerWorkingSetBytes: serverSamples.length
      ? Math.max(...serverSamples.map((sample) => Number(sample.workingSetBytes ?? 0)))
      : null,
    serverCpuSecondsDelta:
      serverSamples.length >= 2
        ? Number(serverSamples.at(-1).cpuSeconds ?? 0) - Number(serverSamples[0].cpuSeconds ?? 0)
        : null,
    maxDatabaseConnections: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.total ?? 0)))
      : null,
    maxDatabaseActive: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.active ?? 0)))
      : null,
    maxDatabaseWaiting: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.waiting ?? 0)))
      : null,
    maxDatabaseLockWaiting: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.lockWaiting ?? 0)))
      : null,
  };
}

export async function cleanupSyntheticData(data, sourceIds) {
  if (!data) return { skipped: true };
  const boardIds = data.boards.map((board) => board.id);
  const promptCardIds = data.promptCards.map((card) => card.id);
  const classroomIds = data.classrooms.map((classroom) => classroom.id);
  const studentIds = data.students.map((student) => student.id);
  const userIds = data.teachers.map((teacher) => teacher.id);

  const [runComments, runLikes] = await Promise.all([
    db.cardComment.findMany({
      where: {
        cardId: { in: promptCardIds },
        authorStudentId: { in: studentIds },
      },
      select: { id: true },
    }),
    db.cardLike.findMany({
      where: {
        cardId: { in: promptCardIds },
        likerStudentId: { in: studentIds },
      },
      select: { id: true },
    }),
  ]);
  const commentIds = [...new Set([
    ...sourceIds.commentIds,
    ...runComments.map((comment) => comment.id),
  ])];
  const likeIds = [...new Set([
    ...sourceIds.likeIds,
    ...runLikes.map((like) => like.id),
  ])];
  const transactionIds = new Set(sourceIds.transactionIds);
  const cleanupStarted = Date.now();
  let processingOutbox = 0;
  let remainingOutbox = 0;
  let outboxSources = [];
  let stableEmptyPasses = 0;
  let cleanupStable = false;

  while (true) {
    const previousTransactionCount = transactionIds.size;
    const rewardTransactions = commentIds.length > 0
      ? await db.transaction.findMany({
          where: {
            sourceType: "comment_reward",
            sourceRef: { in: commentIds },
          },
          select: { id: true },
        })
      : [];
    for (const transaction of rewardTransactions) transactionIds.add(transaction.id);
    outboxSources = exactSyntheticOutboxSources({
      commentIds,
      likeIds,
      transactionIds: [...transactionIds],
    });
    if (outboxSources.length === 0) {
      cleanupStable = true;
      break;
    }

    await db.notificationOutbox.deleteMany({
      where: { OR: outboxSources, status: { not: "processing" } },
    });
    processingOutbox = await db.notificationOutbox.count({
      where: { OR: outboxSources, status: "processing" },
    });
    remainingOutbox = await db.notificationOutbox.count({
      where: { OR: outboxSources },
    });
    const discoveredNewTransaction = transactionIds.size > previousTransactionCount;
    stableEmptyPasses = remainingOutbox === 0 && !discoveredNewTransaction
      ? stableEmptyPasses + 1
      : 0;
    if (stableEmptyPasses >= 2) {
      cleanupStable = true;
      break;
    }
    if (Date.now() - cleanupStarted >= config.cleanupTimeoutMs) break;
    await sleep(Math.min(config.commentRewardPollIntervalMs, 250));
  }

  await db.board.deleteMany({ where: { id: { in: boardIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classroomIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });

  const [boards, classrooms, students, users, outbox] = await Promise.all([
    db.board.count({ where: { id: { in: boardIds } } }),
    db.classroom.count({ where: { id: { in: classroomIds } } }),
    db.student.count({ where: { classroomId: { in: classroomIds } } }),
    db.user.count({ where: { id: { in: userIds } } }),
    outboxSources.length > 0
      ? db.notificationOutbox.count({ where: { OR: outboxSources } })
      : Promise.resolve(0),
  ]);
  return {
    boards,
    classrooms,
    students,
    users,
    outbox,
    processingOutbox,
    cleanupTimedOut: !cleanupStable,
    discoveredComments: commentIds.length,
    discoveredLikes: likeIds.length,
    discoveredRewardTransactions: transactionIds.size,
  };
}
