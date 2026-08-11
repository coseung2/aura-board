import {
  authSecret,
  config,
  createAbortAwareDelay,
  createClient,
  createHmac,
  db,
  encode,
  estimateRealtimeJoinSchedule,
  estimateRealtimeWave,
  expectedRealtimeMessageCounts,
  forwardedHost,
  forwardedProto,
  mkdir,
  nextRealtimeJoinStartAt,
  parseRequestValidation,
  path,
  performance,
  randomBytes,
  realtimeAllocation,
  result,
  resultPath,
  runId,
  selectRealtimeActorsRoundRobin,
  sleep,
  summarizeRealtimeJoinStarts,
  target,
  updateRealtimeCallbackMetrics,
  writeFile,
} from "./loadtest-classroom-context.mjs";
import {
  aggregateGate,
  cleanupSyntheticData,
  closeRealtimeChannels,
  seedSyntheticClassrooms,
  settleCommentRewards,
  startOperationalSampler,
} from "./loadtest-classroom-runtime.mjs";

let realtimeAbort = null;
const realtimeAbortDelay = createAbortAwareDelay();

function hash32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scheduledDelay(phaseName, index, windowMs) {
  if (windowMs <= 0) return 0;
  return Math.floor((hash32(`${runId}:${phaseName}:${index}`) / 0x1_0000_0000) * windowMs);
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function summarizeRows(rows, durationMs) {
  const groups = new Map();
  for (const row of rows) {
    const list = groups.get(row.op) ?? [];
    list.push(row);

    groups.set(row.op, list);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([op, list]) => {
      const durations = list.map((row) => row.ms).sort((left, right) => left - right);
      const failures = list.filter((row) => !row.ok);
      const statuses = {};
      const errors = {};
      for (const row of list) {
        statuses[String(row.status)] = (statuses[String(row.status)] ?? 0) + 1;
        if (!row.ok) {
          const kind = row.errorCode ?? "transport";
          errors[kind] = (errors[kind] ?? 0) + 1;
        }
      }
      return [
        op,
        {
          requests: list.length,
          errors: failures.length,
          errorRate: list.length ? failures.length / list.length : 0,
          throughputPerSecond:
            durationMs > 0 ? Math.round((list.length / (durationMs / 1_000)) * 100) / 100 : null,
          p50Ms: percentile(durations, 0.5),
          p95Ms: percentile(durations, 0.95),
          p99Ms: percentile(durations, 0.99),
          maxMs: durations.length ? Math.round(durations.at(-1) * 10) / 10 : null,
          statuses,
          errorKinds: errors,
          errorSamples: failures.slice(0, 10).map((row) => ({
            status: row.status,
            errorCode: row.errorCode,
          })),
        },
      ];
    }),
  );
}

async function timedRequest(op, pathname, options = {}, validate) {
  const started = performance.now();
  let status = 0;
  let errorCode = null;
  let ok = false;
  let metadata = {};
  try {
    const response = await fetch(new URL(pathname, target), {
      ...options,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    status = response.status;
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const validation = parseRequestValidation(validate ? validate(body) : true);
    ok = response.ok && validation.ok;
    if (ok) metadata = validation.metadata;
    if (!ok) {
      errorCode =
        body && typeof body === "object" && typeof body.error === "string"
          ? body.error
          : response.ok
            ? "invalid_response"
            : `http_${response.status}`;
    }
  } catch (error) {
    errorCode =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message.slice(0, 160)
          : "transport";
  }
  return {
    op,
    status,
    ok,
    errorCode,
    ms: performance.now() - started,
    ...metadata,
  };
}

async function runPhase(name, items, windowMs, operation) {
  const rows = [];
  const started = Date.now();
  await Promise.all(
    items.map(async (item, index) => {
      const delay = scheduledDelay(name, index, windowMs);
      if (!(await realtimeAbortDelay.wait(delay)) || realtimeAbort) return;
      const row = await operation(item, index);
      if (Array.isArray(row)) rows.push(...row);
      else rows.push(row);
      }),
  );
  const durationMs = Date.now() - started;
  const phase = {
    name,
    users: items.length,
    arrivalWindowMs: windowMs,
    durationMs,
    aborted: Boolean(realtimeAbort),
    summary: summarizeRows(rows, durationMs),
  };
  result.phases.push(phase);
  console.log(JSON.stringify({ phase: name, durationMs, summary: phase.summary }));
  if (realtimeAbort) throw new Error(`Realtime immediate abort: ${realtimeAbort.reason}`);
  return rows;
}

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

function proxyHeaders() {
  return {
    host: forwardedHost,
    "x-forwarded-host": forwardedHost,
    "x-forwarded-proto": forwardedProto,
  };
}

function studentOptions(actor, body, method = "GET") {
  return {
    method,
    headers: {
      ...proxyHeaders(),
      authorization: `Bearer ${actor.token}`,
      "x-aura-student-viewer": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function teacherOptions(actor) {
  return {
    method: "GET",
    headers: {
      ...proxyHeaders(),
      cookie: actor.cookie,
    },
  };
}

function incrementCounter(object, key, amount = 1) {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 1;
  object[key] = (object[key] ?? 0) + safeAmount;
}

function recordRealtimeCallback(event) {
  const bucketCount = updateRealtimeCallbackMetrics(
    result.realtime.transportCallbacks,
    event,
    Date.now(),
  );
  if (!realtimeAbort && bucketCount > config.realtimeMaxMessageRate) {
    realtimeAbort = {
      reason: "realtime_callback_peak",
      at: new Date().toISOString(),
      bucketCount,
    };
    result.realtime.abort = realtimeAbort;
    realtimeAbortDelay.abort();
  }
}

function estimateSafeRealtimeWave(name, actors, windowMs) {
  if (config.realtimeClients <= 0) return null;
  const estimate = estimateRealtimeWave({
    selectedActors: actors,
    mutations: seeded.studentActors.map((actor, index) => ({
      boardId: actor.boardId,
      delayMs: scheduledDelay(name, index, windowMs),
    })),
    arrivalWindowMs: windowMs,
    maxDeliveryCallbackRate: config.realtimeMaxMessageRate,
    baselineMessageRate: config.realtimeBaselineMessageRate,
    messageLimit: config.realtimeMessageLimit,
    messageHeadroom: config.realtimeMessageHeadroom,
  });
  result.realtime.preflight ??= {};
  result.realtime.preflight[name] = estimate;
  return estimate;
}

async function openRealtimeChannels(actors) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || config.realtimeClients <= 0) {
    result.realtime.skipped = !url || !key ? "public_supabase_env_missing" : "disabled";
    return [];
  }

  const selected = actors;
  const handles = [];
  const rows = [];
  const started = Date.now();
  const statusPromises = [];
  const actualJoinStarts = [];
  let lastJoinStartedAt = null;
  const scheduled = selected
    .map((actor, index) => ({
      actor,
      index,
      delay: scheduledDelay("realtime-subscribe", index, config.realtimeWindowMs),
    }))
    .sort((left, right) => left.delay - right.delay || left.index - right.index);

  for (const { actor, index, delay } of scheduled) {
      const plannedWaitMs = Math.max(0, started + delay - Date.now());
      if (!(await realtimeAbortDelay.wait(plannedWaitMs)) || realtimeAbort) break;
      const pacing = nextRealtimeJoinStartAt(
        lastJoinStartedAt,
        Date.now(),
        config.realtimeMaxJoinRate,
      );
      while (Date.now() < pacing.startAtMs) {
        if (
          !(await realtimeAbortDelay.wait(pacing.startAtMs - Date.now())) ||
          realtimeAbort
        ) {
          break;
        }
      }
      if (realtimeAbort) break;
      const start = performance.now();
      const client = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
          storageKey: `aura-load-${runId}-${index}`,
        },
      });
      let finished = false;
      let timeoutId;
      let resolveStatus;
      const statusPromise = new Promise((resolve) => {
        resolveStatus = resolve;
      });
      const channel = client
        .channel(`board:${actor.boardId}`)
        .on("broadcast", { event: "card_changed" }, (message) => {
          recordRealtimeCallback("card_changed");
          incrementCounter(
            result.realtime.messageCounts,
            "card_changed",
            Number(message?.payload?.changeCount ?? 1),
          );
        })
        .on("broadcast", { event: "board_changed" }, (message) => {
          recordRealtimeCallback("board_changed");
          const payload = message?.payload;
          const logicalCount =
            payload?.type === "engagement_batch_changed" &&
            Array.isArray(payload.changes)
              ? payload.changes.reduce(
                  (sum, change) =>
                    sum + Number(change?.changeCount ?? 1),
                  0,
                )
              : Number(payload?.changeCount ?? 1);
          incrementCounter(
            result.realtime.messageCounts,
            "board_changed",
            logicalCount,
          );
        });
      const actualStartedAt = Date.now();
      lastJoinStartedAt = actualStartedAt;
      actualJoinStarts.push(actualStartedAt - started);
      result.realtime.joinActual = summarizeRealtimeJoinStarts(
        actualJoinStarts,
        config.realtimeMaxJoinRate,
      );
      if (!result.realtime.joinActual.accepted) {
        realtimeAbort = {
          reason: "realtime_join_actual_peak",
          at: new Date().toISOString(),
          rollingPeakPerSecond: result.realtime.joinActual.rollingPeakPerSecond,
        };
        result.realtime.abort = realtimeAbort;
        realtimeAbortDelay.abort();
        break;
      }
      channel.subscribe((status) => {
          incrementCounter(result.realtime.statusCounts, status);
          if (finished) return;
          if (status === "SUBSCRIBED") {
            finished = true;
            clearTimeout(timeoutId);
            result.realtime.subscribed += 1;
            resolveStatus({ ok: true, status });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            finished = true;
            clearTimeout(timeoutId);
            result.realtime.failed += 1;
            resolveStatus({ ok: false, status });
          }
        });
      timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        result.realtime.failed += 1;
        incrementCounter(result.realtime.statusCounts, "CLIENT_TIMEOUT");
        resolveStatus({ ok: false, status: "CLIENT_TIMEOUT" });
      }, config.realtimeTimeoutMs);

      handles.push({ client, channel });
      statusPromises.push(statusPromise.then((statusResult) => {
        rows.push({
          op: "realtime.subscribe",
          status: statusResult.ok ? 200 : 0,
          ok: statusResult.ok,
          errorCode: statusResult.ok ? null : statusResult.status,
          ms: performance.now() - start,
        });
      }));
  }
  await Promise.all(statusPromises);

  result.realtime.joinActual ??= summarizeRealtimeJoinStarts(
    actualJoinStarts,
    config.realtimeMaxJoinRate,
  );

  const durationMs = Date.now() - started;
  result.phases.push({
    name: "realtime-subscribe",
    users: selected.length,
    arrivalWindowMs: config.realtimeWindowMs,
    durationMs,
    summary: summarizeRows(rows, durationMs),
  });
  console.log(
    JSON.stringify({
      phase: "realtime-subscribe",
      durationMs,
      subscribed: result.realtime.subscribed,
      failed: result.realtime.failed,
    }),
  );
  return handles;
}

async function settleRealtimeMessages(actors, mutationRows) {
  if (result.realtime.skipped || config.realtimeClients <= 0) return;
  const expected = expectedRealtimeMessageCounts(actors, mutationRows, config.realtimeClients);
  result.realtime.expectedMessageCounts = expected;
  const started = Date.now();
  const complete = () =>
    Number(result.realtime.messageCounts.card_changed ?? 0) >= expected.card_changed &&
    Number(result.realtime.messageCounts.board_changed ?? 0) >= expected.board_changed;

  while (
    !complete() &&
    !realtimeAbort &&
    Date.now() - started < config.realtimeSettleTimeoutMs
  ) {
    await sleep(100);
  }

  const actual = {
    card_changed: Number(result.realtime.messageCounts.card_changed ?? 0),
    board_changed: Number(result.realtime.messageCounts.board_changed ?? 0),
  };
  const missing = {
    card_changed: Math.max(0, expected.card_changed - actual.card_changed),
    board_changed: Math.max(0, expected.board_changed - actual.board_changed),
  };
  result.realtime.settle = {
    durationMs: Date.now() - started,
    complete: missing.card_changed === 0 && missing.board_changed === 0,
    expected,
    actual,
    missing,
  };
  console.log(JSON.stringify({ phase: "realtime-settle", ...result.realtime.settle }));
}

let seeded = null;
let realtimeHandles = [];
let stopSampler = async () => undefined;
const mutationRows = [];
const syntheticSources = { commentIds: [], likeIds: [], transactionIds: [] };

async function executeLoadTest() {
  if (!realtimeAllocation.accepted) {
    throw new Error(`Unsafe Realtime allocation: ${realtimeAllocation.failures.join(", ")}`);
  }
  if (process.env.LOADTEST_PREFLIGHT_ONLY === "1") {
    result.preflight = {
      mode: "startup-only",
      accepted: true,
      checkedAt: new Date().toISOString(),
    };
    return;
  }

  const health = await timedRequest("health", "/api/health");
  if (!health.ok) {
    throw new Error(`Target health check failed: ${health.errorCode ?? health.status}`);
  }

  seeded = await seedSyntheticClassrooms({
    createManyBatches,
    randomBytes,
    studentSessionToken,
    teacherSessionCookie,
  });
  result.seed = {
    teachers: seeded.teachers.length,
    classrooms: seeded.classrooms.length,
    students: seeded.students.length,
    boards: seeded.boards.length,
  };
  console.log(JSON.stringify({ seed: result.seed }));
  stopSampler = startOperationalSampler();

  await runPhase(
    "teacher-classroom-list",
    seeded.teacherActors,
    config.teacherWindowMs,
    (teacher) =>
      timedRequest(
        "teacher.classrooms",
        "/api/toolkit/classrooms",
        teacherOptions(teacher),
        (body) => Array.isArray(body?.classrooms) && body.classrooms.length === 1,
      ),
  );

  await runPhase(
    "teacher-board-snapshot",
    seeded.teacherActors,
    config.teacherWindowMs,
    (teacher) =>
      timedRequest(
        "teacher.snapshot",
        `/api/boards/${encodeURIComponent(teacher.boardId)}/snapshot`,
        teacherOptions(teacher),
        (body) => Array.isArray(body?.cards),
      ),
  );

  await runPhase(
    "student-board-open",
    seeded.studentActors,
    config.boardOpenWindowMs,
    (student) =>
      timedRequest(
        "student.board-open",
        `/api/student/board/${encodeURIComponent(student.boardSlug)}`,
        studentOptions(student),
        (body) => body?.board?.id === student.boardId,
      ),
  );

  const selectedRealtimeActors = selectRealtimeActorsRoundRobin(
    seeded.studentActors,
    config.realtimeClients,
  );
  result.realtime.subscribersByBoard = Object.fromEntries(
    selectedRealtimeActors.reduce((counts, actor) => {
      counts.set(actor.boardId, (counts.get(actor.boardId) ?? 0) + 1);
      return counts;
    }, new Map()),
  );
  result.realtime.joinPreflight = estimateRealtimeJoinSchedule(
    selectedRealtimeActors.map((_, index) =>
      scheduledDelay("realtime-subscribe", index, config.realtimeWindowMs),
    ),
    config.realtimeMaxJoinRate,
  );
  const waveEstimates = [
    ["class-card-wave", config.cardWindowMs],
    ["class-comment-wave", config.commentWindowMs],
    ["class-like-wave", config.likeWindowMs],
  ].map(([name, windowMs]) => [
    name,
    estimateSafeRealtimeWave(name, selectedRealtimeActors, windowMs),
  ]);
  const unsafeWave = waveEstimates.find(([, estimate]) => estimate && !estimate.accepted);
  if (unsafeWave) {
    throw new Error(
      `Unsafe Realtime ${unsafeWave[0]} estimate: ${unsafeWave[1].failures.join(", ")}`,
    );
  }
  if (!result.realtime.joinPreflight.accepted) {
    throw new Error(
      `Unsafe Realtime join schedule: rolling peak ${result.realtime.joinPreflight.rollingPeakPerSecond}/sec exceeds ${config.realtimeMaxJoinRate}/sec`,
    );
  }

  realtimeHandles = await openRealtimeChannels(selectedRealtimeActors);

  await runPhase(

    "student-initial-snapshot",
    seeded.studentActors,
    config.snapshotWindowMs,
    (student) =>
      timedRequest(
        "student.snapshot",
        `/api/boards/${encodeURIComponent(student.boardId)}/snapshot`,
        studentOptions(student),
        (body) => Array.isArray(body?.cards),
      ),
  );

  mutationRows.push(...await runPhase(
    "class-card-wave",
    seeded.studentActors,
    config.cardWindowMs,
    (student, index) =>
      timedRequest(
        "card.create",
        "/api/cards",
        studentOptions(
          student,
          {
            boardId: student.boardId,
            title: `수업 응답 ${index + 1}`,
            content: `${runId} 동시 수업 카드`,
          },
          "POST",
        ),
        (body) => typeof body?.card?.id === "string" ? { boardId: student.boardId } : false,
      ),
  ));

  const commentRows = await runPhase(
    "class-comment-wave",
    seeded.studentActors,
    config.commentWindowMs,
    (student, index) =>
      timedRequest(
        "comment.create",
        `/api/cards/${encodeURIComponent(student.promptCardId)}/comments`,
        studentOptions(
          student,
          {
            content: `${runId} 수업 댓글 ${index + 1}`,
            clientRequestId: `${runId}-comment-${index}`,
            audience: "public",
          },
          "POST",
        ),
        (body) => typeof body?.item?.id === "string"
          ? { boardId: student.boardId, sourceId: body.item.id }
          : false,
      ),
  );
  mutationRows.push(...commentRows);
  syntheticSources.commentIds.push(
    ...commentRows.filter((row) => row.ok && row.sourceId).map((row) => row.sourceId),
  );

  const likeRows = await runPhase(
    "class-like-wave",
    seeded.studentActors,
    config.likeWindowMs,
    (student) =>
      timedRequest(
        "like.create",
        `/api/cards/${encodeURIComponent(student.promptCardId)}/like`,
        studentOptions(student, { liked: true }, "POST"),
        (body) => body?.liked === true ? { boardId: student.boardId } : false,
      ),
  );
  mutationRows.push(...likeRows);
  const createdLikes = await db.cardLike.findMany({
    where: {
      cardId: { in: seeded.promptCards.map((card) => card.id) },
      likerStudentId: { in: seeded.students.map((student) => student.id) },
    },
    select: { id: true },
  });
  syntheticSources.likeIds.push(...createdLikes.map((like) => like.id));

  syntheticSources.transactionIds.push(
    ...await settleCommentRewards(syntheticSources.commentIds),
  );

  await sleep(1_000);
  await runPhase(
    "student-reconcile-snapshot",
    seeded.studentActors,
    config.snapshotWindowMs,
    (student) =>
      timedRequest(
        "student.snapshot",
        `/api/boards/${encodeURIComponent(student.boardId)}/snapshot`,
        studentOptions(student),
        (body) => Array.isArray(body?.cards),
      ),
  );
  await settleRealtimeMessages(selectedRealtimeActors, mutationRows);

  result.gate = aggregateGate();
  if (!result.gate.passed) process.exitCode = 2;
}

try {
  await executeLoadTest();
} catch (error) {
  result.fatal = {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
} finally {
  await stopSampler().catch(() => undefined);
  await closeRealtimeChannels(realtimeHandles);
  try {
    result.cleanup = await cleanupSyntheticData(seeded, syntheticSources);
    if (
      result.cleanup &&
      !result.cleanup.skipped &&
      [
        result.cleanup.boards,
        result.cleanup.classrooms,
        result.cleanup.students,
        result.cleanup.users,
        result.cleanup.outbox,
        result.cleanup.processingOutbox,
        result.cleanup.cleanupTimedOut,
      ].some((value) => Number(value) !== 0)
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    result.cleanup = {
      error: error instanceof Error ? error.message : String(error),
    };
    process.exitCode = 1;
  }
  result.finishedAt = new Date().toISOString();
  result.gate = aggregateGate();
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await db.$disconnect();
  console.log(
    JSON.stringify({
      result: resultPath,
      gate: result.gate,
      cleanup: result.cleanup,
      fatal: result.fatal,
    }),
  );
}
