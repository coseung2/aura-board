import { db } from "@/lib/db";
import { getEquippedSlimeFloor } from "@/lib/pets/catalog";
import { resolvePlayActor } from "@/lib/play-platform/actor";
import { playEngineFetch, proxyPlayEngineResponse } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { jsonPrivateNoStore } from "@/lib/http-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const actor = await resolvePlayActor();
    const authorized = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      { actor },
    );
    if (!authorized.ok) return proxyPlayEngineResponse(authorized);

    const session = await db.playSession.findUnique({
      where: { id: sessionId },
      select: {
        startedAtMs: true,
        participants: {
          orderBy: { slot: "asc" },
          select: { actorSubject: true, studentId: true, displayName: true, slot: true },
        },
      },
    });
    if (!session) return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
    const studentIdFor = (participant: { actorSubject: string; studentId: string | null }) => {
      if (participant.studentId) return participant.studentId;
      return participant.actorSubject.startsWith("student:")
        ? participant.actorSubject.slice("student:".length)
        : null;
    };
    const studentIds = [
      ...new Set(session.participants.flatMap((participant) => {
        const studentId = studentIdFor(participant);
        return studentId ? [studentId] : [];
      })),
    ];
    const [students, slimes, results] = await Promise.all([
      db.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, number: true },
      }),
      db.studentSlime.findMany({
        where: { studentId: { in: studentIds }, isRepresentative: true },
        select: { studentId: true, color: true, growthStage: true, equippedItemKeys: true },
      }),
      db.gameResult.findMany({
        where: { studentId: { in: studentIds }, gameKind: "omok" },
        select: { studentId: true, outcome: true },
      }),
    ]);
    const studentById = new Map(students.map((student) => [student.id, student]));
    const slimeById = new Map(slimes.map((slime) => [slime.studentId, slime]));

    return jsonPrivateNoStore({
      startedAtMs: session.startedAtMs == null ? null : Number(session.startedAtMs),
      players: session.participants.map((participant) => {
        const studentId = studentIdFor(participant);
        const student = studentId ? studentById.get(studentId) : null;
        const slime = studentId ? slimeById.get(studentId) : null;
        const records = studentId
          ? results.filter((result) => result.studentId === studentId)
          : [];
        return {
          studentId: studentId ?? participant.actorSubject,
          slot: participant.slot,
          name: student?.name ?? participant.displayName,
          number: student?.number ?? null,
          pet: slime
            ? {
                color: slime.color,
                growthStage: slime.growthStage,
                equippedFloor: getEquippedSlimeFloor(slime.equippedItemKeys),
              }
            : null,
          record: {
            wins: records.filter((result) => result.outcome === "win").length,
            losses: records.filter((result) => result.outcome === "loss").length,
            draws: records.filter((result) => result.outcome === "draw").length,
          },
        };
      }),
    });
  } catch (error) {
    return playRouteError(error);
  }
}
