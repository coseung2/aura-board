/**
 * POST /api/student-plants — student creates their plant for a board.
 * Body: { boardId, speciesId, nickname }
 * Student only. One plant per (board, student).
 */
import { NextResponse } from "next/server";
import { scheduleCardChangeBroadcast } from "@/lib/card-broadcast-queue";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { CreateStudentPlantSchema } from "@/lib/plant-schemas";

export async function POST(req: Request) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const input = CreateStudentPlantSchema.parse(body);

    // Board must belong to this student's classroom
    const board = await db.board.findUnique({
      where: { id: input.boardId },
      select: { id: true, classroomId: true, layout: true },
    });
    if (!board || board.classroomId !== student.classroomId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (board.layout !== "plant-roadmap") {
      return NextResponse.json({ error: "board layout is not plant-roadmap" }, { status: 400 });
    }

    // Species must be allowed for this classroom
    const allow = await db.classroomPlantAllow.findUnique({
      where: {
        classroomId_speciesId: {
          classroomId: student.classroomId,
          speciesId: input.speciesId,
        },
      },
    });
    if (!allow) {
      return NextResponse.json({ error: "species not allowed for this classroom" }, { status: 400 });
    }

    // First stage of this species
    const firstStage = await db.plantStage.findFirst({
      where: { speciesId: input.speciesId },
      orderBy: { order: "asc" },
    });
    if (!firstStage) {
      return NextResponse.json({ error: "species has no stages" }, { status: 500 });
    }

    // One-per-(board, student) enforced by @@unique; catch 2002 if raced
    try {
      const plant = await db.studentPlant.create({
        data: {
          boardId: input.boardId,
          studentId: student.id,
          speciesId: input.speciesId,
          nickname: input.nickname,
          currentStageId: firstStage.id,
        },
        include: { species: true, currentStage: true },
      });
      scheduleCardChangeBroadcast(input.boardId, "update");
      return NextResponse.json({ studentPlant: plant }, { status: 201 });
    } catch (err) {
      const existing = await db.studentPlant.findUnique({
        where: { boardId_studentId: { boardId: input.boardId, studentId: student.id } },
      });
      if (existing) {
        return NextResponse.json({ error: "already exists", studentPlant: existing }, { status: 409 });
      }
      throw err;
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/student-plants]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
