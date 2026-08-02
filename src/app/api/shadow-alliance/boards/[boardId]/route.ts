import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import type { PlayActor } from "@/lib/play-platform/actor";
import {
  PlayEngineUnavailableError,
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { getBoardRole } from "@/lib/rbac";
import type { ShadowAllianceSnapshot } from "@/lib/shadow-alliance/contracts";
import { getCurrentStudent } from "@/lib/student-auth";

type Params = { params: Promise<{ boardId: string }> };

type ResolvedBoard = {
  id: string;
  classroomId: string;
};

type AuthorizedViewer = {
  actor: PlayActor;
  canCommandAsHost: boolean;
};

const CommandSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    runId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: z.enum([
      "join",
      "ready",
      "forfeit",
      "submit",
      "settings",
      "rebalance",
      "start",
      "pause",
      "resume",
      "reveal",
      "postround",
      "next",
      "finish",
      "end-early",
      "rematch",
    ]),
    number: z.number().int().min(1).max(100).optional(),
    editable: z.boolean().optional(),
    timerSec: z.number().int().min(10).max(3600).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "submit" && value.number === undefined) {
      context.addIssue({
        code: "custom",
        path: ["number"],
        message: "number_required",
      });
    }
    if (value.action !== "submit" && value.number !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["number"],
        message: "number_not_allowed",
      });
    }
    if (
      value.action === "settings" &&
      (value.editable === undefined || value.timerSec === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: "settings_required",
      });
    }
    if (
      value.action !== "settings" &&
      (value.editable !== undefined || value.timerSec !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: "settings_not_allowed",
      });
    }
  });

const PARTICIPANT_ACTIONS = new Set(["join", "ready", "forfeit", "submit"]);

async function resolveBoard(boardIdOrSlug: string): Promise<ResolvedBoard | null> {
  const board = await db.board.findFirst({
    where: {
      OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }],
      layout: "shadow-alliance",
    },
    select: { id: true, classroomId: true },
  });
  if (!board?.classroomId) return null;
  return { id: board.id, classroomId: board.classroomId };
}

async function resolveViewer(board: ResolvedBoard): Promise<AuthorizedViewer | Response> {
  const student = await getCurrentStudent();
  if (student) {
    if (student.classroomId !== board.classroomId) {
      return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
    }
    return {
      actor: {
        subject: `student:${student.id}`,
        role: "participant",
        userId: null,
        studentId: student.id,
      },
      canCommandAsHost: false,
    };
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  const role = await getBoardRole(board.id, user.id);
  if (!role) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }
  return {
    actor: {
      subject: `teacher:${user.id}`,
      role: "host",
      userId: user.id,
      studentId: null,
    },
    canCommandAsHost: role === "owner" || role === "editor",
  };
}

function isResponse(value: AuthorizedViewer | Response): value is Response {
  return value instanceof Response;
}

async function readUpstreamJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function playEngineUnavailable(error: unknown): Response | null {
  if (!(error instanceof PlayEngineUnavailableError)) return null;
  return jsonPrivateNoStore(
    { error: "play_engine_unavailable" },
    { status: 503 },
  );
}

async function ensureHostSession(
  board: ResolvedBoard,
  actor: PlayActor,
): Promise<Response> {
  const students = await db.student.findMany({
    where: { classroomId: board.classroomId },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    take: 100,
    select: { id: true, name: true },
  });
  if (students.length < 2) {
    return jsonPrivateNoStore(
      { error: "not_enough_participants" },
      { status: 409 },
    );
  }
  const upstream = await playEngineFetch(
    `/v1/boards/${encodeURIComponent(board.id)}/shadow-alliance/sessions`,
    {
      actor,
      method: "POST",
      body: {
        requestId: `shadow-initial:${board.id}`,
        classroomId: board.classroomId,
        totalRounds: 5,
        participants: students.map((student, index) => ({
          actorSubject: `student:${student.id}`,
          studentId: student.id,
          displayName: `그림자 ${index + 1}`,
        })),
      },
    },
  );
  if (!upstream.ok) return proxyPlayEngineResponse(upstream);
  const body = await readUpstreamJson<{
    snapshot?: ShadowAllianceSnapshot;
  }>(upstream);
  if (!body?.snapshot) {
    return jsonPrivateNoStore({ error: "invalid_upstream_response" }, { status: 502 });
  }
  return jsonPrivateNoStore({
    snapshot: body.snapshot,
    replayed: upstream.headers.get("x-idempotent-replay") === "true",
  });
}

async function verifySessionBoard(
  board: ResolvedBoard,
  runId: string,
  actor: PlayActor,
): Promise<Response | null> {
  const upstream = await playEngineFetch(
    `/v1/shadow-alliance/sessions/${encodeURIComponent(runId)}/snapshot`,
    { actor },
  );
  if (!upstream.ok) return proxyPlayEngineResponse(upstream);
  const snapshot = await readUpstreamJson<ShadowAllianceSnapshot>(upstream);
  if (!snapshot || snapshot.boardId !== board.id) {
    return jsonPrivateNoStore({ error: "run_not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const board = await resolveBoard(boardIdOrSlug);
  if (!board) {
    return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });
  }
  const viewer = await resolveViewer(board);
  if (isResponse(viewer)) return viewer;

  try {
    const upstream = await playEngineFetch(
      `/v1/boards/${encodeURIComponent(board.id)}/shadow-alliance/sessions/current`,
      { actor: viewer.actor },
    );
    if (upstream.status === 404 && viewer.canCommandAsHost) {
      return ensureHostSession(board, viewer.actor);
    }
    if (!upstream.ok) return proxyPlayEngineResponse(upstream);
    const snapshot = await readUpstreamJson<ShadowAllianceSnapshot>(upstream);
    if (!snapshot) {
      return jsonPrivateNoStore({ error: "invalid_upstream_response" }, { status: 502 });
    }
    return jsonPrivateNoStore({ snapshot });
  } catch (error) {
    const unavailable = playEngineUnavailable(error);
    if (unavailable) return unavailable;
    console.error("[GET /api/shadow-alliance/boards/:boardId]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const board = await resolveBoard(boardIdOrSlug);
  if (!board) {
    return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });
  }
  const parsed = CommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const viewer = await resolveViewer(board);
  if (isResponse(viewer)) return viewer;

  const participantAction = PARTICIPANT_ACTIONS.has(parsed.data.action);
  if (participantAction && viewer.actor.role !== "participant") {
    return jsonPrivateNoStore({ error: "student_required" }, { status: 403 });
  }
  if (!participantAction && !viewer.canCommandAsHost) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  try {
    const invalidSession = await verifySessionBoard(
      board,
      parsed.data.runId,
      viewer.actor,
    );
    if (invalidSession) return invalidSession;

    const path =
      parsed.data.action === "rematch"
        ? `/v1/shadow-alliance/sessions/${encodeURIComponent(parsed.data.runId)}/rematch`
        : `/v1/shadow-alliance/sessions/${encodeURIComponent(parsed.data.runId)}/commands`;
    const commandType = {
      join: "join",
      ready: "ready",
      forfeit: "forfeit",
      submit: "submit",
      settings: "update_settings",
      rebalance: "rebalance",
      start: "start",
      pause: "pause",
      resume: "resume",
      reveal: "reveal",
      postround: "postround",
      next: "next_round",
      finish: "finish",
      "end-early": "host_end",
      rematch: "rematch",
    }[parsed.data.action];
    const upstream = await playEngineFetch(path, {
      actor: viewer.actor,
      method: "POST",
      body:
        parsed.data.action === "rematch"
          ? { requestId: parsed.data.requestId }
          : {
              requestId: parsed.data.requestId,
              expectedVersion: parsed.data.expectedVersion,
              commandSchemaVersion: 1,
              command: {
                type: commandType,
                ...(parsed.data.number === undefined
                  ? {}
                  : { number: parsed.data.number }),
                ...(parsed.data.action === "settings"
                  ? {
                      editable: parsed.data.editable,
                      timerSec: parsed.data.timerSec,
                    }
                  : {}),
              },
            },
    });
    if (!upstream.ok) return proxyPlayEngineResponse(upstream);
    const body = await readUpstreamJson<Record<string, unknown>>(upstream);
    if (!body) {
      return jsonPrivateNoStore({ error: "invalid_upstream_response" }, { status: 502 });
    }
    return jsonPrivateNoStore({
      ...body,
      replayed: upstream.headers.get("x-idempotent-replay") === "true",
    });
  } catch (error) {
    const unavailable = playEngineUnavailable(error);
    if (unavailable) return unavailable;
    console.error("[PATCH /api/shadow-alliance/boards/:boardId]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
