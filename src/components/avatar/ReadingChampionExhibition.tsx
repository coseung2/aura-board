"use client";

import type { CSSProperties } from "react";
import type { AvatarGalleryStudent } from "./types";

type ExhibitionStyle = CSSProperties & Record<string, string | number>;

type Props = {
  students: AvatarGalleryStudent[];
  badgesByStudentId?: Record<string, string>;
  minFloors?: number;
  ariaLabel?: string;
};

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 2;
const STUDENTS_PER_FLOOR = 6;
const DEFAULT_VISIBLE_FLOORS = 5;

const SPAWN_X = [17.1, 30.9, 44.6, 58.2, 71.9, 85.6];
const SPAWN_Y = [19.2, 36.1, 53.6, 71.4, 88.4];
const FRAME_BY_SLOT = [0, 1, 5, 0, 1, 7];

function spriteStyle(row: number, frame: number): ExhibitionStyle {
  return {
    "--avatar-sprite-position-x": `${(frame / (SPRITE_COLUMNS - 1)) * 100}%`,
    "--avatar-sprite-position-y": `${(row / (SPRITE_ROWS - 1)) * 100}%`,
  };
}

function residentStyle(floorIndex: number, slotIndex: number): ExhibitionStyle {
  const fallbackY =
    SPAWN_Y[SPAWN_Y.length - 1] + (floorIndex - SPAWN_Y.length + 1) * 14;
  return {
    "--spawn-x": `${SPAWN_X[slotIndex] ?? 50}%`,
    "--spawn-y": `${SPAWN_Y[floorIndex] ?? fallbackY}%`,
  };
}

function spriteRowFor(student: AvatarGalleryStudent): number {
  if (student.gender === "female") return 1;
  if (student.gender === "male") return 0;
  return (student.number ?? 1) % 2 === 0 ? 1 : 0;
}

function chunkStudents(students: AvatarGalleryStudent[]) {
  const floors: AvatarGalleryStudent[][] = [];
  for (let i = 0; i < students.length; i += STUDENTS_PER_FLOOR) {
    floors.push(students.slice(i, i + STUDENTS_PER_FLOOR));
  }
  return floors;
}

function ExhibitionFloor({
  students,
  floorIndex,
  badgesByStudentId,
}: {
  students: AvatarGalleryStudent[];
  floorIndex: number;
  badgesByStudentId: Record<string, string>;
}) {
  return (
    <div className="character-town-floor" role="presentation">
      {students.map((student, index) => {
        const number = student.number ?? floorIndex * STUDENTS_PER_FLOOR + index + 1;
        const spriteRow = spriteRowFor(student);
        const spriteFrame = FRAME_BY_SLOT[index] ?? 0;
        const badge = badgesByStudentId[student.id];

        return (
          <div
            key={student.id}
            className="character-town-resident"
            style={residentStyle(floorIndex, index)}
            role="listitem"
          >
            <div className="character-town-avatar-wrap">
              <span
                className="character-town-sprite"
                style={spriteStyle(spriteRow, spriteFrame)}
                role="img"
                aria-label={`${student.name} 아바타`}
              />
            </div>
            {badge && <span className="character-town-badge">{badge}</span>}
            <span className="character-town-name">
              {student.number !== null ? `${student.number}번 ` : ""}
              {student.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ReadingChampionExhibition({
  students,
  badgesByStudentId = {},
  minFloors = DEFAULT_VISIBLE_FLOORS,
  ariaLabel = "우리 반 독서왕 전시공간",
}: Props) {
  const studentFloors = chunkStudents(students);
  const floorCount = Math.max(studentFloors.length, minFloors);
  const floors = Array.from(
    { length: floorCount },
    (_, index) => studentFloors[index] ?? [],
  );

  return (
    <div className="character-town-map" aria-label={ariaLabel}>
      <div className="character-town-map-scroll">
        <div
          className="character-town-ground"
          role="list"
          aria-label={ariaLabel}
          style={{ "--floor-count": floors.length } as ExhibitionStyle}
        >
          {floors.map((floorStudents, index) => (
            <ExhibitionFloor
              key={index}
              students={floorStudents}
              floorIndex={index}
              badgesByStudentId={badgesByStudentId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
