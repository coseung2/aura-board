import { describe, it, expect } from "vitest";
import {
  canViewCard,
  canEditCard,
  canDeleteCard,
  canAddCardToBoard,
  boardCaps,
  asIdentities,
  type Identity,
  type Identities,
  type BoardLike,
  type CardLike,
} from "../card-permissions";

// Test fixtures — minimal board + card shape.
const BOARD: BoardLike = {
  id: "b1",
  classroomId: "c1",
  ownerUserId: "u_teacher",
};

const BOARD_NO_CLASSROOM: BoardLike = {
  id: "b2",
  classroomId: null,
  ownerUserId: "u_teacher",
};

// Board in a DIFFERENT classroom than the teacher owns — used for the
// teacher-is-also-parent-of-kid-in-another-class case.
const BOARD_OTHER_CLASS: BoardLike = {
  id: "b_other_class",
  classroomId: "c_other",
  ownerUserId: "u_other_teacher",
};

const CARD_TEACHER: CardLike = {
  id: "card1",
  boardId: "b1",
  authorId: "u_teacher",
  studentAuthorId: null,
};

const CARD_STUDENT_A: CardLike = {
  id: "card2",
  boardId: "b1",
  authorId: "u_teacher",
  studentAuthorId: "s_alice",
};

const CARD_STUDENT_B: CardLike = {
  id: "card3",
  boardId: "b1",
  authorId: "u_teacher",
  studentAuthorId: "s_bob",
};

// Cross-board card shouldn't pass — used to test boardId guard.
const CARD_OTHER_BOARD: CardLike = {
  id: "card4",
  boardId: "b_other",
  authorId: "u_teacher",
  studentAuthorId: "s_alice",
};

const CARD_SKY_IN_OTHER_CLASS: CardLike = {
  id: "card_sky",
  boardId: "b_other_class",
  authorId: "u_other_teacher",
  studentAuthorId: "s_sky",
};

const teacherOwner: Identity = {
  kind: "teacher",
  userId: "u_teacher",
  name: "Teacher",
  ownsBoardIds: new Set(["b1", "b2"]),
};

const teacherNonOwner: Identity = {
  kind: "teacher",
  userId: "u_random",
  name: "Other",
  ownsBoardIds: new Set(),
};

const studentAlice: Identity = {
  kind: "student",
  studentId: "s_alice",
  name: "Alice",
  classroomId: "c1",
};

const studentOtherClass: Identity = {
  kind: "student",
  studentId: "s_zen",
  name: "Zen",
  classroomId: "c_other",
};

const parentOfAlice: Identity = {
  kind: "parent",
  parentId: "p_alice_parent",
  childStudentIds: new Set(["s_alice"]),
};

const parentOfNobody: Identity = {
  kind: "parent",
  parentId: "p_lonely",
  childStudentIds: new Set(),
};

const anon: Identity = { kind: "anon" };

// Helper — convenience alias for readability in single-identity tests.
const ids = (i: Identity): Identities => asIdentities(i);

describe("card-permissions — teacher", () => {
  it("owner can view/edit/delete any card on their board", () => {
    expect(canViewCard(ids(teacherOwner), BOARD, CARD_TEACHER)).toBe(true);
    expect(canViewCard(ids(teacherOwner), BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canEditCard(ids(teacherOwner), BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canDeleteCard(ids(teacherOwner), BOARD, CARD_STUDENT_A)).toBe(true);
  });
  it("owner can add cards to their board", () => {
    expect(canAddCardToBoard(ids(teacherOwner), BOARD)).toBe(true);
    expect(canAddCardToBoard(ids(teacherOwner), BOARD_NO_CLASSROOM)).toBe(true);
  });
  it("non-owner teacher has no card-level write access via primitive", () => {
    expect(canEditCard(ids(teacherNonOwner), BOARD, CARD_TEACHER)).toBe(false);
    expect(canDeleteCard(ids(teacherNonOwner), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canAddCardToBoard(ids(teacherNonOwner), BOARD)).toBe(false);
  });
});

describe("card-permissions — student", () => {
  it("same-classroom student can view all cards on board", () => {
    expect(canViewCard(ids(studentAlice), BOARD, CARD_TEACHER)).toBe(true);
    expect(canViewCard(ids(studentAlice), BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canViewCard(ids(studentAlice), BOARD, CARD_STUDENT_B)).toBe(true);
  });
  it("student can edit/delete only their own card", () => {
    expect(canEditCard(ids(studentAlice), BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canDeleteCard(ids(studentAlice), BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canEditCard(ids(studentAlice), BOARD, CARD_STUDENT_B)).toBe(false);
    expect(canEditCard(ids(studentAlice), BOARD, CARD_TEACHER)).toBe(false);
  });
  it("student can add cards to their classroom's board", () => {
    expect(canAddCardToBoard(ids(studentAlice), BOARD)).toBe(true);
  });
  it("student can't add to board without classroom", () => {
    expect(canAddCardToBoard(ids(studentAlice), BOARD_NO_CLASSROOM)).toBe(false);
  });
  it("student from different classroom is denied everywhere", () => {
    expect(canViewCard(ids(studentOtherClass), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canEditCard(ids(studentOtherClass), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canAddCardToBoard(ids(studentOtherClass), BOARD)).toBe(false);
  });
});

describe("card-permissions — parent", () => {
  it("parent can view card of their child", () => {
    expect(canViewCard(ids(parentOfAlice), BOARD, CARD_STUDENT_A)).toBe(true);
  });
  it("parent cannot view other children's cards", () => {
    expect(canViewCard(ids(parentOfAlice), BOARD, CARD_STUDENT_B)).toBe(false);
    expect(canViewCard(ids(parentOfAlice), BOARD, CARD_TEACHER)).toBe(false);
  });
  it("parent cannot edit/delete/add — read-only", () => {
    expect(canEditCard(ids(parentOfAlice), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canDeleteCard(ids(parentOfAlice), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canAddCardToBoard(ids(parentOfAlice), BOARD)).toBe(false);
  });
  it("parent without active children sees nothing", () => {
    expect(canViewCard(ids(parentOfNobody), BOARD, CARD_STUDENT_A)).toBe(false);
  });
});

describe("card-permissions — anon + edge cases", () => {
  it("anonymous sees nothing and can do nothing", () => {
    expect(canViewCard(ids(anon), BOARD, CARD_TEACHER)).toBe(false);
    expect(canEditCard(ids(anon), BOARD, CARD_STUDENT_A)).toBe(false);
    expect(canAddCardToBoard(ids(anon), BOARD)).toBe(false);
  });
  it("cross-board card is always false (boardId guard)", () => {
    expect(canViewCard(ids(teacherOwner), BOARD, CARD_OTHER_BOARD)).toBe(false);
    expect(canEditCard(ids(studentAlice), BOARD, CARD_OTHER_BOARD)).toBe(false);
  });
});

describe("boardCaps convenience", () => {
  it("teacher owner gets full caps", () => {
    const caps = boardCaps(ids(teacherOwner), BOARD);
    expect(caps.canAddCard).toBe(true);
    expect(caps.canEditOwn).toBe(true);
  });
  it("student same-classroom gets add + edit-own", () => {
    const caps = boardCaps(ids(studentAlice), BOARD);
    expect(caps.canAddCard).toBe(true);
    expect(caps.canEditOwn).toBe(true);
  });
  it("parent cannot add or edit", () => {
    const caps = boardCaps(ids(parentOfAlice), BOARD);
    expect(caps.canAddCard).toBe(false);
    expect(caps.canEditOwn).toBe(false);
  });
});

// ─── Multi-identity regression — the reason resolveIdentities exists ──────
describe("card-permissions — multi-identity", () => {
  // A teacher owning class c1 (board b1) who is also the parent of a
  // student `s_sky` in ANOTHER class (board b_other_class).
  const teacherAndParent: Identities = {
    teacher: {
      userId: "u_teacher",
      name: "Teacher/Parent",
      ownsBoardIds: new Set(["b1"]),
    },
    student: null,
    parent: {
      parentId: "p_sky_parent",
      childStudentIds: new Set(["s_sky"]),
    },
    share: null,
    primary: "teacher",
  };

  it("teacher owner path still wins on their own board", () => {
    expect(canViewCard(teacherAndParent, BOARD, CARD_STUDENT_A)).toBe(true);
    expect(canEditCard(teacherAndParent, BOARD, CARD_STUDENT_A)).toBe(true);
  });

  it("parent path surfaces the child's card in the OTHER classroom's board", () => {
    // Pre-multi-identity: this returned false because resolveIdentity
    // collapsed to the teacher precedence and teacher doesn't own
    // BOARD_OTHER_CLASS. The whole reason for Identities is that this
    // now returns true via the parent path.
    expect(
      canViewCard(teacherAndParent, BOARD_OTHER_CLASS, CARD_SKY_IN_OTHER_CLASS)
    ).toBe(true);
  });

  it("parent path does NOT unlock edit — only view", () => {
    expect(
      canEditCard(teacherAndParent, BOARD_OTHER_CLASS, CARD_SKY_IN_OTHER_CLASS)
    ).toBe(false);
  });

  it("stray student cookie next to teacher session does not grant extra edit", () => {
    // The POST-precedence bug from earlier today reincarnated as a read
    // question: a teacher with a leftover student cookie. Teacher owns
    // b1, stray student cookie is for s_zen (classroom c_other). The
    // student path doesn't apply to BOARD (classroom c1), so this
    // collapses to the teacher path on BOARD.
    const teacherWithStraleStudent: Identities = {
      teacher: {
        userId: "u_teacher",
        name: "Teacher",
        ownsBoardIds: new Set(["b1"]),
      },
      student: { studentId: "s_zen", name: "Zen", classroomId: "c_other" },
      parent: null,
      share: null,
      primary: "teacher",
    };
    expect(canEditCard(teacherWithStraleStudent, BOARD, CARD_STUDENT_A)).toBe(true);
    expect(
      canEditCard(teacherWithStraleStudent, BOARD_OTHER_CLASS, CARD_SKY_IN_OTHER_CLASS)
    ).toBe(false);
  });
});
