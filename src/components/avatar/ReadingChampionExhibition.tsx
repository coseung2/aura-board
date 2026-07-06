"use client";

import type { CSSProperties } from "react";
import { CharacterAvatar } from "./CharacterAvatar";
import type { AvatarGalleryStudent, AvatarItem } from "./types";

type ExhibitionStyle = CSSProperties & Record<string, string | number>;

type Props = {
  students: AvatarGalleryStudent[];
  items?: AvatarItem[];
  badgesByStudentId?: Record<string, string>;
  minFloors?: number;
  ariaLabel?: string;
};

const STUDENTS_PER_FLOOR = 6;
const DEFAULT_VISIBLE_FLOORS = 5;
const SPAWN_X = [17.1, 30.9, 44.6, 58.2, 71.9, 85.6];
const SPAWN_Y = [19.2, 36.1, 53.6, 71.4, 88.4];
const FRAME_BY_SLOT = [0, 1, 5, 0, 1, 7];

function residentStyle(floorIndex: number, slotIndex: number): ExhibitionStyle {
  const fallbackY =
    SPAWN_Y[SPAWN_Y.length - 1] + (floorIndex - SPAWN_Y.length + 1) * 14;
  return {
    "--spawn-x": `${SPAWN_X[slotIndex] ?? 50}%`,
    "--spawn-y": `${SPAWN_Y[floorIndex] ?? fallbackY}%`,
  };
}

function fallbackGender(student: AvatarGalleryStudent): "male" | "female" {
  if (student.gender === "female") return "female";
  if (student.gender === "male") return "male";
  return (student.number ?? 1) % 2 === 0 ? "female" : "male";
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
  items,
  badgesByStudentId,
}: {
  students: AvatarGalleryStudent[];
  floorIndex: number;
  items: AvatarItem[];
  badgesByStudentId: Record<string, string>;
}) {
  return (
    <div className="character-town-floor" role="presentation">
      {students.map((student, index) => {
        const badge = badgesByStudentId[student.id];

        return (
          <div
            key={student.id}
            className="character-town-resident"
            style={residentStyle(floorIndex, index)}
            role="listitem"
          >
            <div className="character-town-avatar-wrap">
              <CharacterAvatar
                items={items}
                equipped={student.equipped}
                size={92}
                className="character-town-avatar"
                ariaLabel={`${student.name} 아바타`}
                gender={fallbackGender(student)}
                spriteFrame={FRAME_BY_SLOT[index] ?? 0}
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
  items = [],
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
              items={items}
              badgesByStudentId={badgesByStudentId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
