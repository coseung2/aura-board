#!/usr/bin/env node
import {
  ARRIVAL_MS,
  CLASSROOM_OFFSET,
  CLASSROOMS,
  MIXED_ACTIONS,
  OMOK_POLL_ATTEMPTS,
  OMOK_POLL_BASE_MS,
  OMOK_POLL_MAX_MS,
  PROFILE,
  READ_P95_BUDGET_MS,
  RESULT_DIR,
  RETRY_LIMIT,
  RUN_ID,
  RUN_STARTED_AT,
  STUDENT_CODE_PREFIX,
  STUDENTS_PER_CLASS,
  TARGET,
  TEACHER_PASSWORD,
  TEACHER_USERNAME,
  TIMEOUT_MS,
  WRITE_P95_BUDGET_MS,
  absorbCookies,
  actorFor,
  actorHeaders,
  actors,
  classRepresentatives,
  cookieHeader,
  env,
  expectedStatusPredicate,
  http,
  integerEnv,
  jitter,
  logical,
  loginTeacher,
  metrics,
  pad,
  parseJson,
  phases,
  requestId,
  required,
  responseSetCookies,
  sleep,
  splitSetCookieHeader,
  syntheticIp,
} from "./loadtest-mobile-tenancy-context.mjs";

async function runArrivalPhase(name, items, durationMs, task) {
  const phaseStarted = performance.now();
  const metricStart = metrics.length;
  console.log(JSON.stringify({ event: "phase_start", name, items: items.length, durationMs }));
  const denominator = Math.max(1, items.length - 1);
  const outcomes = await Promise.all(
    items.map(async (item, index) => {
      if (durationMs > 0) await sleep(Math.floor((durationMs * index) / denominator));
      try {
        return await task(item, index);
      } catch (caught) {
        return {
          ok: false,
          error: caught instanceof Error ? caught.message : "phase_task_failed",
        };
      }
    }),
  );
  const phaseMetrics = metrics.slice(metricStart);
  const phase = {
    name,
    items: items.length,
    durationMs: performance.now() - phaseStarted,
    requests: phaseMetrics.length,
    requestErrors: phaseMetrics.filter((metric) => !metric.ok).length,
    taskFailures: outcomes.filter((outcome) => outcome?.ok === false).length,
  };
  phases.push(phase);
  console.log(JSON.stringify({ event: "phase_end", ...phase }));
  return outcomes;
}

function quantile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarizeMetrics(rows) {
  const statusCounts = {};
  const errorCounts = {};
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.error) errorCounts[row.error] = (errorCounts[row.error] ?? 0) + 1;
  }
  const latencies = rows.filter((row) => row.status > 0).map((row) => row.elapsedMs);
  const bytes = rows.map((row) => row.responseBytes ?? 0);
  return {
    requests: rows.length,
    successes: rows.filter((row) => row.ok).length,
    errors: rows.filter((row) => !row.ok).length,
    errorRate: rows.length === 0 ? 0 : rows.filter((row) => !row.ok).length / rows.length,
    statusCounts,
    errorCounts,
    latencyMs: {
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
      p99: quantile(latencies, 0.99),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    responseBytes: {
      p50: quantile(bytes, 0.5),
      p95: quantile(bytes, 0.95),

      max: bytes.length ? Math.max(...bytes) : 0,
      total: bytes.reduce((sum, value) => sum + value, 0),
    },
  };
}

async function authenticateStudents() {
  await runArrivalPhase("student-auth", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("student.login", "/api/student/auth", {
      actor,
      method: "POST",
      json: { token: actor.code },
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (
      result.ok &&
      typeof result.body?.sessionToken === "string" &&
      result.body?.student?.id === actor.studentId
    ) {
      actor.sessionToken = result.body.sessionToken;
      return { ok: true };
    }
    return { ok: false, error: result.error ?? "invalid_login_response" };
  });
  logical.actorsAuthenticated = actors.filter((actor) => actor.sessionToken).length;
  if (logical.actorsAuthenticated < Math.ceil(actors.length * 0.95)) {
    throw new Error(
      `Only ${logical.actorsAuthenticated}/${actors.length} actors authenticated; refusing destructive phases`,
    );
  }
}

async function initializeShadowBoards(teacherCookie) {
  await runArrivalPhase("shadow-host-initialize", classRepresentatives(), Math.min(ARRIVAL_MS, 10_000), async (actor) => {
    const result = await http("shadow.host", `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      headers: {
        cookie: teacherCookie,
        "x-forwarded-for": "198.19.255.1",
      },
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    return { ok: result.ok };
  });
}

async function exerciseCoreBoardFlows() {
  await runArrivalPhase("board-open", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("board.open", `/api/student/board/${actor.boardSlug}`, {
      actor,
      expected: 200,
    });
    return { ok: result.ok && result.body?.board?.id === actor.boardId };
  });

  await runArrivalPhase("tenant-isolation-board", actors, Math.min(ARRIVAL_MS, 10_000), async (actor) => {
    const nextClass =
      CLASSROOM_OFFSET + ((actor.classIndex - CLASSROOM_OFFSET + 1) % CLASSROOMS);
    const foreignSlug = `${RUN_ID}-board-${pad(nextClass, 2)}`;
    const result = await http("tenant.board.denied", `/api/student/board/${foreignSlug}`, {
      actor,
      expected: [403, 404],
    });
    if (result.status === 200) logical.tenantLeaks += 1;
    return { ok: result.ok && result.status !== 200 };
  });

  await runArrivalPhase("board-snapshot", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("board.snapshot", `/api/boards/${actor.boardId}/snapshot`, {
      actor,
      expected: 200,
    });
    return { ok: result.ok };
  });

  await runArrivalPhase("card-create", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("card.create", "/api/cards", {
      actor,
      method: "POST",
      json: {
        boardId: actor.boardId,
        title: `모바일 부하 ${actor.globalIndex}`,
        content: `${RUN_ID} 게시물 ${actor.globalIndex} ${Date.now()}`,
      },
      expected: [200, 201],
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok && typeof result.body?.card?.id === "string") {
      actor.createdCardId = result.body.card.id;
      logical.cardsCreated += 1;
    }
    return { ok: result.ok };
  });

  await runArrivalPhase("comment-create", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("comment.create", `/api/cards/${actor.promptCardId}/comments`, {
      actor,
      method: "POST",
      json: {
        content: `${RUN_ID} 댓글 ${actor.globalIndex} ${Date.now()}`,
        clientRequestId: requestId("comment", actor),
        audience: "public",
      },
      expected: [200, 201],
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok) logical.commentsCreated += 1;
    return { ok: result.ok };
  });

  await runArrivalPhase("card-like", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("card.like", `/api/cards/${actor.promptCardId}/like`, {
      actor,
      method: "POST",
      json: { liked: true },
      expected: 200,
    });
    if (result.ok) logical.likesUpdated += 1;
    return { ok: result.ok };
  });
}

async function exercisePetFlows() {
  await runArrivalPhase("pet-home", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("pet.home", "/api/student/slimes", {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok && Array.isArray(result.body?.ownedColors)) logical.petHomesRead += 1;
    return { ok: result.ok };
  });

  await runArrivalPhase("pet-classroom", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("pet.classroom", "/api/student/slimes/classroom", {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok) logical.petClassroomsRead += 1;
    return { ok: result.ok };
  });
}

async function readShadowSnapshots() {
  await runArrivalPhase("shadow-read", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("shadow.read", `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok && result.body?.snapshot) actor.shadowSnapshot = result.body.snapshot;
    return { ok: Boolean(actor.shadowSnapshot) };
  });
}

function selfShadowParticipant(snapshot) {
  return Array.isArray(snapshot?.participants)
    ? snapshot.participants.find((participant) => participant?.isSelf === true) ?? null
    : null;
}

function shadowAlreadySatisfied(actor, action) {
  const participant = selfShadowParticipant(actor.shadowSnapshot);
  if (!participant) return false;
  if (action === "join") return participant.joinedAt != null;
  if (action === "ready") return participant.readyAt != null;
  return false;
}

async function shadowCommandWithRetry(actor, action, number) {
  if (shadowAlreadySatisfied(actor, action)) return true;
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    if (!actor.shadowSnapshot?.id || !Number.isSafeInteger(actor.shadowSnapshot?.version)) {
      const refreshed = await http(`shadow.${action}.refresh`, `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
        actor,
        expected: 200,
        timeoutMs: TIMEOUT_MS * 2,
      });
      if (refreshed.body?.snapshot) actor.shadowSnapshot = refreshed.body.snapshot;
    }
    const snapshot = actor.shadowSnapshot;
    if (!snapshot?.id || !Number.isSafeInteger(snapshot.version)) return false;
    if (shadowAlreadySatisfied(actor, action)) return true;

    const result = await http(`shadow.${action}.retry`, `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      actor,
      method: "PATCH",
      json: {
        requestId: requestId(`shadow_${action}`, actor, attempt),
        runId: snapshot.id,
        expectedVersion: snapshot.version,
        action,
        ...(number === undefined ? {} : { number }),
      },
      expected: [200, 409],
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.body?.snapshot) actor.shadowSnapshot = result.body.snapshot;
    if (result.status === 200) return true;
    if (result.status !== 409 || result.body?.error !== "version_conflict") return false;
    await sleep(jitter(15 + attempt * 3, 80, (actor.globalIndex % 97) / 97));
  }
  return false;
}

async function exerciseShadowGameplay(teacherCookie) {
  await runArrivalPhase("shadow-mobile-one-shot-join", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => {
    const snapshot = actor.shadowSnapshot;
    if (!snapshot?.id || !Number.isSafeInteger(snapshot.version)) {
      return { ok: false, error: "missing_shadow_snapshot" };
    }
    const result = await http(
      "shadow.join.mobile-one-shot",
      `/api/shadow-alliance/boards/${actor.shadowBoardId}`,
      {
        actor,
        method: "PATCH",
        json: {
          requestId: requestId("shadow_join_mobile", actor),
          runId: snapshot.id,
          expectedVersion: snapshot.version,
          action: "join",
        },
        expected: [200, 409],
        timeoutMs: TIMEOUT_MS * 2,
      },
    );
    if (result.body?.snapshot) actor.shadowSnapshot = result.body.snapshot;
    if (result.status === 200) logical.shadowOneShotJoined += 1;
    if (result.status === 409 && result.body?.error === "version_conflict") {
      logical.shadowOneShotConflicts += 1;
    }
    return { ok: result.status === 200 || result.status === 409 };
  });

  const joined = await runArrivalPhase("shadow-join-recovery", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => ({
    ok: await shadowCommandWithRetry(actor, "join"),
  }));
  logical.shadowJoinedAfterRetry = joined.filter((outcome) => outcome?.ok).length;

  const ready = await runArrivalPhase("shadow-ready", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => ({
    ok: await shadowCommandWithRetry(actor, "ready"),
  }));
  logical.shadowReadyAfterRetry = ready.filter((outcome) => outcome?.ok).length;

  await runArrivalPhase("shadow-host-start", classRepresentatives(), Math.min(ARRIVAL_MS, 5_000), async (actor) => {
    const current = await http("shadow.start.read", `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      headers: { cookie: teacherCookie, "x-forwarded-for": "198.19.255.1" },
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    const snapshot = current.body?.snapshot;
    if (!snapshot?.id || !Number.isSafeInteger(snapshot.version)) return { ok: false };
    if (snapshot.phase === "playing") {
      logical.shadowStarted += 1;
      return { ok: true };
    }
    const started = await http("shadow.start", `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      method: "PATCH",
      headers: { cookie: teacherCookie, "x-forwarded-for": "198.19.255.1" },
      json: {
        requestId: requestId("shadow_start", null),
        runId: snapshot.id,
        expectedVersion: snapshot.version,
        action: "start",
      },
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (started.ok) logical.shadowStarted += 1;
    return { ok: started.ok };
  });

  await readShadowSnapshots();
  const submitted = await runArrivalPhase("shadow-submit", actors, Math.min(ARRIVAL_MS, 10_000), async (actor) => ({
    ok: await shadowCommandWithRetry(actor, "submit", (actor.globalIndex % 100) + 1),
  }));
  logical.shadowSubmittedAfterRetry = submitted.filter((outcome) => outcome?.ok).length;

  await runArrivalPhase("tenant-isolation-shadow", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => {
    const nextClass =
      CLASSROOM_OFFSET + ((actor.classIndex - CLASSROOM_OFFSET + 1) % CLASSROOMS);
    const foreignBoardId = `${RUN_ID}-shadow-${pad(nextClass, 2)}`;
    const result = await http("tenant.shadow.denied", `/api/shadow-alliance/boards/${foreignBoardId}`, {
      actor,
      expected: [403, 404],
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.status === 200) logical.tenantLeaks += 1;
    return { ok: result.ok && result.status !== 200 };
  });
}

async function pollOmokMatch(actor) {
  if (actor.omokStatus?.status === "matched" && actor.omokStatus.sessionId) return true;
  for (let attempt = 0; attempt < OMOK_POLL_ATTEMPTS; attempt += 1) {
    const baseDelay = Math.min(OMOK_POLL_MAX_MS, OMOK_POLL_BASE_MS * 2 ** attempt);
    const spread = Math.max(100, Math.floor(baseDelay * 0.35));
    await sleep(jitter(baseDelay, spread, ((actor.globalIndex + attempt * 17) % 101) / 101));
    const result = await http("omok.matchmaking.poll", `/api/play/boards/${actor.omokLobbyId}/matchmaking`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok) actor.omokStatus = result.body;
    if (actor.omokStatus?.status === "matched" && actor.omokStatus.sessionId) return true;
    if ([401, 403, 404].includes(result.status)) return false;
  }
  return false;
}

function firstEmptyPosition(snapshot) {
  const board = snapshot?.game?.board;
  if (!Array.isArray(board) || board.length !== 225) return null;
  const index = board.findIndex((cell) => cell == null);
  if (index < 0) return null;
  return { row: Math.floor(index / 15), column: index % 15 };
}

async function playOmokGroup(group) {
  const current = group.map((actor) => actor.omokSnapshot).find(Boolean);
  const nextTurn = current?.game?.nextTurn;
  const firstActor = group.find((actor) => actor.omokSnapshot?.viewer?.slot === nextTurn);
  if (!firstActor) return { ok: false, first: false, second: false };
  const firstPosition = firstEmptyPosition(firstActor.omokSnapshot);
  if (!firstPosition) return { ok: false, first: false, second: false };

  const first = await http("omok.move.first", `/api/play/sessions/${firstActor.omokSnapshot.sessionId}/commands`, {
    actor: firstActor,
    method: "POST",
    json: {
      requestId: requestId("omok_place", firstActor),
      expectedVersion: firstActor.omokSnapshot.version,
      commandSchemaVersion: 1,
      command: { type: "place_stone", position: firstPosition },
    },
    expected: 200,
    timeoutMs: TIMEOUT_MS * 2,
  });
  if (!first.ok || !first.body?.snapshot) return { ok: false, first: false, second: false };
  firstActor.omokSnapshot = first.body.snapshot;
  logical.omokFirstMoves += 1;

  const secondActor = group.find((actor) => actor !== firstActor);
  if (!secondActor) return { ok: true, first: true, second: false };
  const refreshed = await http("omok.move.refresh", `/api/play/boards/${secondActor.omokBoardId}/session`, {
    actor: secondActor,
    expected: 200,
    timeoutMs: TIMEOUT_MS * 2,
  });
  if (!refreshed.ok || !refreshed.body) return { ok: false, first: true, second: false };
  secondActor.omokSnapshot = refreshed.body;
  const secondPosition = firstEmptyPosition(secondActor.omokSnapshot);
  if (!secondPosition) return { ok: false, first: true, second: false };
  const second = await http("omok.move.second", `/api/play/sessions/${secondActor.omokSnapshot.sessionId}/commands`, {
    actor: secondActor,
    method: "POST",
    json: {
      requestId: requestId("omok_place", secondActor),
      expectedVersion: secondActor.omokSnapshot.version,
      commandSchemaVersion: 1,
      command: { type: "place_stone", position: secondPosition },
    },
    expected: 200,
    timeoutMs: TIMEOUT_MS * 2,
  });
  if (second.ok && second.body?.snapshot) {
    secondActor.omokSnapshot = second.body.snapshot;
    logical.omokSecondMoves += 1;
  }
  return { ok: first.ok && second.ok, first: first.ok, second: second.ok };
}

async function exerciseOmokGameplay() {
  await runArrivalPhase("omok-matchmaking", actors, ARRIVAL_MS, async (actor) => {
    const result = await http("omok.matchmaking", `/api/play/boards/${actor.omokLobbyId}/matchmaking`, {
      actor,
      method: "POST",
      json: { opponent: "human" },
      expected: 200,
      timeoutMs: Math.max(TIMEOUT_MS * 4, 60_000),
    });
    if (result.ok) actor.omokStatus = result.body;
    return { ok: result.ok };
  });

  const matched = await runArrivalPhase("omok-match-poll", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => ({
    ok: await pollOmokMatch(actor),
  }));
  logical.omokMatched = matched.filter((outcome) => outcome?.ok).length;

  await runArrivalPhase("omok-match-board-open", actors, ARRIVAL_MS, async (actor) => {
    const slug = actor.omokStatus?.boardSlug;
    if (typeof slug !== "string") return { ok: false, error: "missing_match_slug" };
    const result = await http("omok.board.open", `/api/student/board/${encodeURIComponent(slug)}`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,

    });
    if (result.ok && typeof result.body?.board?.id === "string") {
      actor.omokBoardId = result.body.board.id;
    }
    return { ok: Boolean(actor.omokBoardId) };
  });

  await runArrivalPhase("omok-session-read", actors, ARRIVAL_MS, async (actor) => {
    if (!actor.omokBoardId) return { ok: false, error: "missing_match_board" };
    const result = await http("omok.session.read", `/api/play/boards/${actor.omokBoardId}/session`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.ok && result.body?.sessionId) actor.omokSnapshot = result.body;
    return { ok: Boolean(actor.omokSnapshot) };
  });

  const groupsBySession = new Map();
  for (const actor of actors) {
    const sessionId = actor.omokSnapshot?.sessionId;
    if (!sessionId) continue;
    const group = groupsBySession.get(sessionId) ?? [];
    group.push(actor);
    groupsBySession.set(sessionId, group);
  }
  const groups = [...groupsBySession.values()].filter((group) => group.length === 2);
  logical.omokSessions = groups.length;
  await runArrivalPhase("omok-play-two-moves", groups, Math.min(ARRIVAL_MS, 10_000), playOmokGroup);

  await runArrivalPhase("tenant-isolation-omok", actors, Math.min(ARRIVAL_MS, 8_000), async (actor) => {
    const nextClass =
      CLASSROOM_OFFSET + ((actor.classIndex - CLASSROOM_OFFSET + 1) % CLASSROOMS);
    const foreignLobby = `${RUN_ID}-omok-${pad(nextClass, 2)}`;
    const result = await http("tenant.omok.denied", `/api/play/boards/${foreignLobby}/matchmaking`, {
      actor,
      expected: [403, 404],
      timeoutMs: TIMEOUT_MS * 2,
    });
    if (result.status === 200) logical.tenantLeaks += 1;
    return { ok: result.ok && result.status !== 200 };
  });
}

async function mixedAction(actor, step) {
  const choice = (actor.globalIndex + step) % 8;
  if (choice === 0) {
    return http("mixed.board", `/api/student/board/${actor.boardSlug}`, { actor, expected: 200 });
  }
  if (choice === 1) {
    return http("mixed.snapshot", `/api/boards/${actor.boardId}/snapshot`, { actor, expected: 200 });
  }
  if (choice === 2) {
    return http("mixed.pet-home", "/api/student/slimes", {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
  }
  if (choice === 3) {
    return http("mixed.pet-classroom", "/api/student/slimes/classroom", {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
  }
  if (choice === 4) {
    return http("mixed.shadow", `/api/shadow-alliance/boards/${actor.shadowBoardId}`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
  }
  if (choice === 5 && actor.omokBoardId) {
    return http("mixed.omok", `/api/play/boards/${actor.omokBoardId}/session`, {
      actor,
      expected: 200,
      timeoutMs: TIMEOUT_MS * 2,
    });
  }
  if (choice === 6) {
    return http("mixed.card-create", "/api/cards", {
      actor,
      method: "POST",
      json: {
        boardId: actor.boardId,
        title: `혼합 부하 ${actor.globalIndex}-${step}`,
        content: `${RUN_ID} 혼합 게시물 ${Date.now()}`,
      },
      expected: [200, 201],
      timeoutMs: TIMEOUT_MS * 2,
    });
  }
  return http("mixed.comment-create", `/api/cards/${actor.promptCardId}/comments`, {
    actor,
    method: "POST",
    json: {
      content: `${RUN_ID} 혼합 댓글 ${actor.globalIndex}-${step}`,
      clientRequestId: requestId("mixed_comment", actor, step),
      audience: "public",
    },
    expected: [200, 201],
    timeoutMs: TIMEOUT_MS * 2,
  });
}

async function exerciseMixedSteadyState() {
  if (MIXED_ACTIONS === 0) return;
  await runArrivalPhase("mixed-1000-session", actors, Math.min(ARRIVAL_MS, 10_000), async (actor) => {
    let completed = 0;
    for (let step = 0; step < MIXED_ACTIONS; step += 1) {
      const result = await mixedAction(actor, step);
      if (result.ok) completed += 1;
      if (step + 1 < MIXED_ACTIONS) {
        await sleep(jitter(250, 750, ((actor.globalIndex * 13 + step * 19) % 101) / 101));
      }
    }
    logical.mixedActionsCompleted += completed;
    return { ok: completed === MIXED_ACTIONS };
  });
}

async function health(operation) {
  return http(operation, "/api/health", {
    expected: 200,
    timeoutMs: TIMEOUT_MS,
  });
}

function buildReport(fatalError = null) {
  const byOperation = {};
  for (const operation of [...new Set(metrics.map((metric) => metric.operation))].sort()) {
    byOperation[operation] = summarizeMetrics(metrics.filter((metric) => metric.operation === operation));
  }

  const expectedDenials = new Set([
    "tenant.board.denied",
    "tenant.shadow.denied",
    "tenant.omok.denied",
  ]);
  const readRows = metrics.filter(
    (metric) => metric.method === "GET" && metric.ok && !expectedDenials.has(metric.operation),
  );
  const writeRows = metrics.filter(
    (metric) => metric.method !== "GET" && metric.ok && metric.operation !== "teacher.login",
  );
  const overall = summarizeMetrics(metrics);
  const reads = summarizeMetrics(readRows);
  const writes = summarizeMetrics(writeRows);

  const expectedOmokSessions = Math.floor(logical.actorsPlanned / 2);
  const minimumOmokSessions = Math.floor(expectedOmokSessions * 0.99);
  const criteria = {
    noFatalError: fatalError == null,
    allActorsAuthenticated: logical.actorsAuthenticated === logical.actorsPlanned,
    transportErrorRateAtMost1Percent: overall.errorRate <= 0.01,
    noTenantLeaks: logical.tenantLeaks === 0,
    cardsAtLeast99Percent: logical.cardsCreated >= Math.floor(logical.actorsPlanned * 0.99),
    commentsAtLeast99Percent: logical.commentsCreated >= Math.floor(logical.actorsPlanned * 0.99),
    likesAtLeast99Percent: logical.likesUpdated >= Math.floor(logical.actorsPlanned * 0.99),
    petHomeAtLeast99Percent: logical.petHomesRead >= Math.floor(logical.actorsPlanned * 0.99),
    petClassroomAtLeast99Percent:
      logical.petClassroomsRead >= Math.floor(logical.actorsPlanned * 0.99),
    readP95WithinBudget: reads.latencyMs.p95 <= READ_P95_BUDGET_MS,
    writeP95WithinBudget: writes.latencyMs.p95 <= WRITE_P95_BUDGET_MS,
    ...(PROFILE === "full"
      ? {
          shadowJoinRecoveredAtLeast99Percent:
            logical.shadowJoinedAfterRetry >= Math.floor(logical.actorsPlanned * 0.99),
          shadowReadyAtLeast99Percent:
            logical.shadowReadyAfterRetry >= Math.floor(logical.actorsPlanned * 0.99),
          shadowSubmitAtLeast99Percent:
            logical.shadowSubmittedAfterRetry >= Math.floor(logical.actorsPlanned * 0.99),
          shadowAllClassroomsStarted: logical.shadowStarted === CLASSROOMS,
          omokMatchedAtLeast99Percent:
            logical.omokMatched >= Math.floor(logical.actorsPlanned * 0.99),
          omokExpectedSessionCount: logical.omokSessions >= minimumOmokSessions,
          omokFirstMovesAtLeast99Percent:
            logical.omokFirstMoves >= minimumOmokSessions,
          omokSecondMovesAtLeast99Percent:
            logical.omokSecondMoves >= minimumOmokSessions,
          mixedActionsAtLeast99Percent:
            logical.mixedActionsCompleted >=
            Math.floor(logical.actorsPlanned * MIXED_ACTIONS * 0.99),
        }
      : {}),
  };

  return {
    runId: RUN_ID,
    target: TARGET,
    profile: PROFILE,
    startedAt: RUN_STARTED_AT.toISOString(),
    finishedAt: new Date().toISOString(),
    configuration: {
      classroomOffset: CLASSROOM_OFFSET,
      classrooms: CLASSROOMS,
      studentsPerClass: STUDENTS_PER_CLASS,
      actors: actors.length,
      arrivalMs: ARRIVAL_MS,
      mixedActions: MIXED_ACTIONS,
      timeoutMs: TIMEOUT_MS,
      retryLimit: RETRY_LIMIT,
      omokPoll: {
        attempts: OMOK_POLL_ATTEMPTS,
        baseMs: OMOK_POLL_BASE_MS,
        maxMs: OMOK_POLL_MAX_MS,
      },
      budgets: { readP95Ms: READ_P95_BUDGET_MS, writeP95Ms: WRITE_P95_BUDGET_MS },
    },
    fatalError,
    logical,
    phases,
    summary: { overall, reads, writes, byOperation },
    criteria,
    passed: Object.values(criteria).every(Boolean),
  };
}

async function writeReport(report) {
  await mkdir(RESULT_DIR, { recursive: true });
  const safeStarted = RUN_STARTED_AT.toISOString().replaceAll(":", "-");
  const path = `${RESULT_DIR}/mobile-tenancy-${PROFILE}-${safeStarted}.json`;
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "report", path, passed: report.passed }));
  return path;
}

async function main() {
  console.log(
    JSON.stringify({
      event: "run_start",
      runId: RUN_ID,
      target: TARGET,
      profile: PROFILE,
      actors: actors.length,
      classrooms: CLASSROOMS,
      classroomOffset: CLASSROOM_OFFSET,
    }),
  );

  await health("health.before");
  const teacherCookie = await loginTeacher();
  await authenticateStudents();
  await initializeShadowBoards(teacherCookie);
  await exerciseCoreBoardFlows();
  await exercisePetFlows();
  await readShadowSnapshots();

  if (PROFILE === "full") {
    await exerciseShadowGameplay(teacherCookie);
    await exerciseOmokGameplay();
    await exerciseMixedSteadyState();
  }

  await health("health.after");
  const report = buildReport();
  await writeReport(report);
  console.log(JSON.stringify({ event: "run_end", passed: report.passed, criteria: report.criteria }));
  if (!report.passed) process.exitCode = 1;
}

main().catch(async (caught) => {
  const fatalError = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
  console.error(fatalError);
  const report = buildReport(fatalError);
  await writeReport(report).catch(() => undefined);
  process.exitCode = 1;
});
