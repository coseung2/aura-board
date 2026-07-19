// Aura-board 서버 응답 DTO 의 모바일 사본. 웹 side 와 shape 1:1.
// 스키마 변경 시 여기도 동기화 필요. (단위 테스트 X — 스모크로 커버.)

export type BoardMeta = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  description?: string | null;
  classroomId?: string | null;
  anonymousAuthor: boolean;
  // 2026-06-27 모바일 student DTO 확장: 교사 보드 설정의 썸네일/테마/스트림
  // 섹션 토글 값. 폴백 처리는 프론트에서 결정하므로 옵셔널 + nullable 로 받는다.
  // enum 소스가 모바일에 로컬 타입으로 공유되어 있지 않아 string|null 로 둠.
  thumbnailMode?: string | null;
  thumbnailUrl?: string | null;
  boardTheme?: string | null;
  streamSectionsEnabled?: boolean;
  category?: "LESSON" | "PLAY";
  cardCount?: number;
  quizzes?: Array<{ roomCode: string; status: string }>;
  kordleStatus?: string | null;
  speedGameStatus?: string | null;
  shadowAllianceStatus?: "waiting" | "active" | "ended" | null;
  breakout?: StudentHomeBreakout | null;
  _count?: { cards: number };
};

export type StudentHomeBreakout = {
  assignmentId: string;
  boardSlug: string;
  boardTitle: string;
  groupCapacity: number;
  selectedSectionId: string | null;
  groups: Array<{
    groupIndex: number;
    entrySectionId: string;
    totalCount: number;
    sections: Array<{ id: string; title: string; count: number }>;
  }>;
};

export type StudentAssignmentTodo = {
  id: string;
  sectionId: string;
  boardId: string;
  boardSlug: string;
  boardTitle: string;
  sectionTitle: string;
  href?: string | null;
  assignedAt: string;
  reminderSentAt?: string | null;
  submitted: boolean;
  submittedAt?: string | null;
};

export type StudentNotificationItem = {
  id: string;
  kind: "like" | "comment";
  actorLabel: string;
  cardTitle: string;
  boardTitle: string;
  href: string;
  createdAt: string;
  content?: string;
  read: boolean;
};

export type StudentNotificationPayload = {
  count: number;
  items: StudentNotificationItem[];
};

export type MeResponse = {
  student: {
    id: string;
    name: string;
    classroom: { id: string; name: string } | null;
  };
  boards: BoardMeta[];
  duties?: StudentDuty[];
  assignments?: StudentAssignmentTodo[];
};

export type StudentAuthResponse = {
  success: boolean;
  sessionToken: string;
  redirect?: string;
  student: {
    id: string;
    name: string;
    classroomId: string;
  };
};

export type StudentDuty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

export type SpeedGameWire = {
  id: string;
  boardId: string;
  boardSlug: string;
  classroomId: string;
  status: "waiting" | "active" | "finished";
  roundIndex: number;
  answerMode: "exact" | "normalize-space" | "teacher-approval";
  baseScore: number;
  minScore: number;
  bonusRanks: number[];
  timeLimitMs: number;
  rounds: Array<{
    id: string;
    order: number;
    keyword: string;
    guesserSlot: number;
    startedAt: string | null;
    endedAt: string | null;
  }>;
  answers: Array<{
    id: string;
    roundId: string;
    groupId: string;
    studentId: string;
    answer: string;
    correct: boolean | null;
    elapsedMs: number;
    rank: number | null;
    score: number | null;
    createdAt: string;
  }>;
  groups: Array<{ id: string; name: string; studentIds: string[] }>;
  leaderboard: Array<{ groupId: string; groupName: string; score: number }>;
};

export type WalletSummary = {
  studentName?: string;
  classroomId?: string;
  balance: number;
  currency: {
    unitLabel: string;
    monthlyInterestRate: number | null;
  };
  card?: { id: string; cardNumber: string; status: string } | null;
  activeFDs: Array<{
    id: string;
    principal: number;
    monthlyRate: number;
    startDate?: string;
    maturityDate: string;
  }>;
  recentTransactions?: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }>;
};

export type BankOverview = {
  currency: { unitLabel: string; monthlyInterestRate: number | null };
  students: Array<{
    id: string;
    number: number | null;
    name: string;
    balance: number;
    accountId: string | null;
  }>;
  activeFDs: Array<{
    id: string;
    accountId: string;
    principal: number;
    monthlyRate: number;
    startDate: string;
    maturityDate: string;
  }>;
  totals: { totalBalance: number; activeFDTotal: number };
  recentTransactions: Array<{
    id: string;
    accountId: string;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    performedByKind: string;
    createdAt: string;
  }>;
  viewerKind: "teacher" | "banker";
  canCancelFD: boolean;
};

export type StoreItem = {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  imageUrl: string | null;
};

export type StoreChargeReceipt = {
  total: number;
  balance: number;
  student: { id: string; name: string; number: number | null };
  items: Array<{ id: string; name: string; price: number; qty: number }>;
};

export type CheckTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isActive: boolean;
  submittedCount: number;
  totalStudents: number;
  createdAt: string;
};

export type CheckTaskListResponse = {
  tasks: CheckTask[];
};

export type CheckRosterEntry = {
  student: { id: string; name: string; number: number | null };
  submission: {
    id: string;
    submitted: boolean;
    checkedAt: string | null;
    checkedById: string | null;
  } | null;
};

export type CheckTaskDetailResponse = {
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  roster: CheckRosterEntry[];
};

export type CardAttachment = {
  id: string;
  kind: "image" | "video" | "file" | "link";
  url: string;
  previewUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

export type CardAuthor = {
  id: string;
  displayName: string;
  studentId: string | null;
};

export type BoardCard = {
  id: string;
  boardId: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  thumbUrl?: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  order: number | null;
  sectionId: string | null;
  authorId: string | null;
  externalAuthorName: string | null;
  studentAuthorId: string | null;
  // DJ queue 전용 — pending/approved/rejected/played
  queueStatus?: string | null;
  // Submission 경로 — 학생이 POST /api/boards/:id/queue 로 올린 카드
  createdAt: string;
  updatedAt: string;
  likeCount?: number;
  commentCount?: number;
  attachments?: CardAttachment[];
  authors?: CardAuthor[];
  authorName?: string | null;
  studentAuthorName?: string | null;
  anonymousAuthor: boolean;
  // 서버에서 같이 내려주는 카드 단위 권한 플래그. 모바일 UI는 이 값을 보고
  // 본인 카드 수정/삭제 메뉴 / DJ pending 삭제 버튼 노출 여부를 결정한다.
  isMine?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  isOwnPendingQueue?: boolean;
};

export type Section = {
  id: string;
  boardId: string;
  title: string;
  order: number;
  color: string | null;
};

// ─── Plant Journal Types (웹 src/types/plant.ts 와 1:1 동기화) ───

export type Difficulty = "easy" | "medium" | "hard";
export type Season = "spring" | "summer" | "fall" | "winter" | "all";

export interface StageDTO {
  id: string;
  order: number;
  key: string;
  nameKo: string;
  description: string;
  icon: string;
  observationPoints: string[];
}

export interface SpeciesDTO {
  id: string;
  key: string;
  nameKo: string;
  emoji: string;
  difficulty: Difficulty | string;
  season: Season | string;
  notes: string;
  stages: StageDTO[];
}

export interface ObservationImageDTO {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  order: number;
}

export interface ObservationDTO {
  id: string;
  stageId: string;
  memo: string;
  noPhotoReason: string | null;
  observedAt: string;
  images: ObservationImageDTO[];
}

export interface StudentPlantDTO {
  id: string;
  speciesId: string;
  nickname: string;
  currentStageId: string;
  species: SpeciesDTO;
  observations: ObservationDTO[];
}

export interface PlantJournalResponse {
  board: { id: string; title: string; classroomId: string | null };
  role: "owner" | "editor" | "viewer" | null;
  viewer: { kind: string; studentId: string | null };
  species: SpeciesDTO[];
  myPlant: StudentPlantDTO | null;
}

// ─── Board Detail Response ───

export type BoardDetailResponse = {
  board: BoardMeta;
  cards: BoardCard[];
  sections: Section[];
  currentStudent: {
    id: string;
    name: string;
    classroomId: string;
  };
  capabilities?: {
    canControlQueue: boolean;
    canAddCard?: boolean;
    canEditOwnCard?: boolean;
    canDeleteOwnCard?: boolean;
  };
  layoutData: {
    quiz?: {
      room: {
        id: string;
        roomCode: string | null;
        status: string;
        title: string | null;
      } | null;
    };
    assignment?: {
      slots: Array<{
        id: string;
        boardId: string;
        studentId: string;
        slotNumber: number;
        submissionStatus: string;
        gradingStatus: string;
        grade: string | null;
        returnReason: string | null;
        card: {
          id: string;
          title: string;
          content: string;
          imageUrl: string | null;
          linkUrl: string | null;
          fileUrl: string | null;
        };
        student: { id: string; name: string; number: number | null };
        submission: {
          id: string;
          content: string | null;
          imageUrl: string | null;
          fileUrl: string | null;
          linkUrl: string | null;
          submittedAt: string;
        } | null;
      }>;
    };
    vibeArcade?: {
      config: {
        enabled: boolean;
        perStudentDailyTokenCap: number;
        classroomDailyTokenPool: number;
      } | null;
      projects: Array<{
        id: string;
        title: string;
        updatedAt: string;
        thumbnailUrl: string | null;
        moderationStatus: string;
        authorStudentId: string | null;
      }>;
    };
    plantRoadmap?: {
      plants: Array<{
        id: string;
        nickname: string;
        speciesId: string;
        currentStageId: string;
        species: SpeciesDTO;
        currentStage: StageDTO;
        observations: ObservationDTO[];
      }>;
    };
    speedGame?: { game: SpeedGameWire | null };
    eventSignup?: {
      accessMode: string;
      accessToken: string | null;
      applicationStart: string | null;
      applicationEnd: string | null;
      eventPosterUrl: string | null;
      venue: string | null;
      maxSelections: number | null;
    };
    breakout?: {
      assignmentId: string;
      status: string;
      visibility: "own-only" | "peek-others";
      sectionIds: string[];
      ownSectionIds: string[];
      writableSectionIds: string[];
    } | null;
  };
};

// ─── Parent DTO types ───

/** GET /api/parent/children 의 children 항목. */
export type ParentChild = {
  id: string;
  studentId: string;
  number: number | null;
  name: string;
  classroom: { id: string; name: string } | null;
  linkedAt: string;
};

export type ParentPendingLink = {
  id: string;
  studentId: string;
  number: number | null;
  name: string;
  classroom: { id: string; name: string } | null;
  requestedAt: string;
  expiresAt: string;
};

/** GET /api/parent/children 응답. */
export type ParentChildrenResponse = {
  parent: { id: string; name: string; email: string | null };
  children: ParentChild[];
  pendingLinks: ParentPendingLink[];
};

export type PortfolioCardDTO = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  width: number;
  height: number;
  imageUrl: string | null;
  thumbUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  externalAuthorName: string | null;
  studentAuthorName: string | null;
  authorName: string | null;
  likeCount: number;
  commentCount: number;
  authors: Array<{
    id: string;
    studentId: string | null;
    displayName: string;
    order: number;
  }>;
  attachments: Array<{
    id: string;
    kind: string;
    url: string;
    previewUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  sourceBoard: {
    id: string;
    slug: string;
    title: string;
    layout: string;
    anonymousAuthor: boolean;
  };
  sourceSection: { id: string; title: string } | null;
  isShowcasedByMe: boolean;
  hasAnyShowcase: boolean;
  createdAt: string;
};

export type ParentChildSummary = {
  id: string;
  name: string;
  number: number | null;
  classroomId: string;
  classroomName: string;
};

export type ParentPostDTO = PortfolioCardDTO & {
  linkedChildren: ParentChildSummary[];
  contentKind: "media" | "text";
};

export type ShowcaseEntryDTO = {
  cardId: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  card: PortfolioCardDTO;
  createdAt: string;
};

export type PortfolioRosterStudentDTO = {
  id: string;
  name: string;
  number: number | null;
  cardCount: number;
  showcaseCount: number;
};

export type PortfolioRosterDTO = {
  classroom: { id: string; name: string };
  students: PortfolioRosterStudentDTO[];
};

export type PortfolioStudentDTO = {
  student: { id: string; name: string; number: number | null };
  cards: PortfolioCardDTO[];
};

export type ParentFeedResponse = {
  items: ParentPostDTO[];
  nextCursor: string | null;
};

export type ParentChildPostsResponse = ParentFeedResponse & {
  child: ParentChildSummary;
};

// ─── Parent Child-Link DTO types ───

/** POST /api/parent/match/code 요청/응답. */
export type ParentMatchCodeRequest = { code: string };

export type ParentMatchCodeResponse = {
  ticket: string;
  classroomName: string;
};

/** GET /api/parent/match/students 응답. */
export type ParentMatchStudent = {
  id: string;
  classNo: number;
  studentNo: number;
  name: string;
};

export type ParentMatchStudentsResponse = {
  classroomName: string;
  students: ParentMatchStudent[];
};

/** POST /api/parent/match/request 요청/응답. */
export type ParentMatchRequest = {
  ticket: string;
  studentId: string;
};

export type ParentMatchRequestResponse = {
  linkId: string;
  status: string;
};
