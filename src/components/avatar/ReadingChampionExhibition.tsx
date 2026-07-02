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
const DEFAULT_VISIBLE_FLOORS = 7;
const STUDENTS_PER_FLOOR = 4;

function spriteStyle(row: number, frame: number): ExhibitionStyle {
  return {
    "--avatar-sprite-position-x": `${(frame / (SPRITE_COLUMNS - 1)) * 100}%`,
    "--avatar-sprite-position-y": `${(row / (SPRITE_ROWS - 1)) * 100}%`,
  };
}

function chunkStudents(students: AvatarGalleryStudent[]) {
  const rows: AvatarGalleryStudent[][] = [];
  for (let i = 0; i < students.length; i += STUDENTS_PER_FLOOR) {
    rows.push(students.slice(i, i + STUDENTS_PER_FLOOR));
  }
  return rows;
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
    <div
      className="character-town-floor"
      style={{ "--floor-index": floorIndex } as ExhibitionStyle}
    >
      {students.map((student, index) => {
        const visible = student.galleryVisible;
        const number = student.number ?? floorIndex * STUDENTS_PER_FLOOR + index + 1;
        const spriteRow = number % 2 === 0 ? 1 : 0;
        const spriteFrame =
          index === 3 ? 7 : index === 2 ? 5 : index === 1 ? 1 : 0;
        const badge = badgesByStudentId[student.id];

        return (
          <div
            key={student.id}
            className={`character-town-resident${visible ? "" : " is-hidden"}`}
            style={{ "--resident-slot": index } as ExhibitionStyle}
            role="listitem"
          >
            <div className="character-town-avatar-wrap">
              {visible ? (
                <span
                  className="character-town-sprite"
                  style={spriteStyle(spriteRow, spriteFrame)}
                  role="img"
                  aria-label={`${student.name} 아바타`}
                />
              ) : (
                <div className="character-town-hidden" aria-label="비공개 캐릭터">
                  <span>?</span>
                </div>
              )}
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
  const rows = chunkStudents(students);
  const floorCount = Math.max(rows.length, minFloors);
  const floors = Array.from({ length: floorCount }, (_, index) => rows[index] ?? []);

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
