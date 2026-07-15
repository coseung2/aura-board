import { baseColors } from "./base-colors.cjs";

// Design tokens — RN port of web src/styles/base.css :root.
// Web is the source of truth. Component files should import these tokens or
// shared UI primitives instead of hard-coding color/radius/shadow values.
//
// RN 에는 CSS 변수가 없으므로 전부 JS 상수로 고정. StyleSheet 에서 참조.

export const colors = {
  transparent: "transparent",
  bg: baseColors.bg,
  bgAlt: baseColors.bg,
  surface: baseColors.bg,
  surfaceAlt: "rgba(24, 74, 92, 0.07)",
  text: "#18313f",
  textMuted: "#5d6f76",
  textFaint: "#8fa0a6",
  accent: "#1683c7",
  accentActive: "#0d679f",
  accentTintedBg: "#e9f7ff",
  accentTintedText: "#0f70ad",
  border: "rgba(24, 74, 92, 0.14)",
  borderHover: "rgba(24, 74, 92, 0.23)",
  onAccent: "#ffffff",
  overlay: "rgba(24, 49, 63, 0.42)",
  modalBackdrop: "rgba(15, 23, 42, 0.48)",
  surfaceGlass: "rgba(255, 255, 255, 0.82)",
  surfaceGlassStrong: "rgba(255, 255, 255, 0.94)",
  lightboxOverlay: "rgba(0, 0, 0, 0.92)",
  lightboxControlBg: "rgba(255, 255, 255, 0.15)",
  lightboxControlSoftBg: "rgba(255, 255, 255, 0.14)",
  mediaBackdrop: "#000000",
  mediaDotsBg: "rgba(0, 0, 0, 0.45)",
  mediaDotBg: "rgba(255, 255, 255, 0.4)",
  mediaNavDarkText: "rgba(20, 18, 15, 0.88)",
  mediaNavLightShadow: "rgba(255, 255, 255, 0.62)",
  mediaNavDarkShadow: "rgba(0, 0, 0, 0.55)",
  danger: "#c62828",
  dangerActive: "#a01b1b",
  dangerTintedBg: "rgba(198, 40, 40, 0.08)",
  warning: "#f59e0b",
  warningTintedBg: "#fef3c7",
  warningTintedText: "#92610a",
  showcase: "#f5a623",
  rankingGold: "#c9a227",
  mediaLilac: "#c7b8ff",
  mediaLilacDark: "#b79bff",
  mediaLavender: "#d6b8ff",
  mediaNeutral: "#b5b5b5",
  recapSongBg: "#fff7e6",
  recapSongBorder: "rgba(201, 162, 39, 0.3)",
  recapDjBg: "#e8f3ff",
  recapDjBorder: "rgba(22, 131, 199, 0.3)",
  showcaseBand: "#eaf6ff",

  plantActive: "#27a35f",
  plantActivePressed: "#20824d",
  plantActiveTintedBg: "rgba(39, 163, 95, 0.05)",
  plantVisited: "#b8dfc7",
  plantUpcoming: "#d0cfcd",
  plantStalled: "#c62828",

  statusSubmittedBg: "#f2f9ff",
  statusSubmittedText: "#1565c0",
  statusReviewedBg: "#e8f5e9",
  statusReviewedText: "#2e7d32",
  statusReturnedBg: "#ffebee",
  statusReturnedText: "#c62828",

  vibeRating: "#f5a623",
  vibeRatingEmpty: "#e5e5e5",
  vibeQuotaOk: "#27a35f",
  vibeQuotaWarn: "#f5a623",
  vibeQuotaDanger: "#c62828",
  vibeSandboxBg: "#1a1a1a",
  vibeChatUserBg: "#e9f7ff",
  vibeModalBackdrop: "#000000",
  vibeModalControlBg: "rgba(255, 255, 255, 0.15)",
  vibeModalControlActiveBg: "rgba(255, 255, 255, 0.3)",

  bankPositive: "#27a35f",
  bankNegative: "#c62828",
  oauthGoogle: "#4285F4",
  oauthKakao: "#FEE500",
  quizA: "#e53935",
  quizB: "#1e88e5",
  quizC: "#fbc02d",
  quizD: "#43a047",
} as const;

export const radii = {
  none: 0,
  card: 16,
  btn: 10,
  control: 12,
  pill: 9999,
} as const;

/** Shadow — RN 은 iOS(shadow*) / Android(elevation) 분리. 웹의 multi-layer soft
 *  느낌을 Android 는 낮은 elevation 로, iOS 는 단일 soft shadow 로 근사.
 *  기본 surface 는 "둥둥 뜨는" 인상을 막기 위해 elevation 1만 허용한다. */
export const shadows = {
  card: {
    boxShadow: "0 2px 10px rgba(24, 74, 92, 0.08)",
  },
  cardHover: {
    boxShadow: "0 4px 14px rgba(24, 74, 92, 0.1)",
  },
  lift: {
    boxShadow: "0 1px 6px rgba(24, 74, 92, 0.09)",
  },
  accent: {
    boxShadow: "0 4px 14px rgba(22, 131, 199, 0.18)",
  },
} as const;

export const fontFamilies = {
  regular: "NotoSansKR_400Regular",
  semibold: "NotoSansKR_600SemiBold",
  bold: "NotoSansKR_700Bold",
  banner: "NeoDunggeunmo",
} as const;

/** 8-role type scale. 웹 design-system.md §2 와 동일한 semantic 이름. */
export const typography = {
  display: {
    fontFamily: fontFamilies.bold,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 32,
  } as const,
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 26,
  } as const,
  subtitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 22,
  } as const,
  section: {
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 21,
  } as const,
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  } as const,
  label: {
    fontFamily: fontFamilies.semibold,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 18,
  } as const,
  badge: {
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 16,
  } as const,
  micro: {
    fontFamily: fontFamilies.semibold,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 15,
  } as const,
  code: {
    fontFamily: fontFamilies.bold,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 48,
  } as const,
};

/** Tap target — handoff ingest T1-1. 학생 태블릿 기준. */
export const tapMin = 44;

/** 공통 spacing scale — 4px base grid. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 28,
  xl: 40,
  hero: 56,
  empty: 64,
  gate: 80,
} as const;

export const layout = {
  readableMaxWidth: 960,
  roleCardWidth: 240,
  roleCardNarrowMaxWidth: 320,
  roleCardMinHeight: 320,
  mobileBreakpoint: 640,
  authTwoPaneBreakpoint: 720,
  boardGridPadding: spacing.xl,
  boardGridGap: spacing.md,
  boardGridMinCardWidth: 260,
  mobileBoardColumns: 2,
} as const;

/** Shared title -> banner -> page-content geometry for mobile screens. */
export const pageChrome = {
  horizontalPadding: spacing.xl,
  /** First child is a shared 48px SectionHeader. */
  contentStartGap: spacing.lg,
  /** Cards, grids, or body copy start directly after the banner. */
  directContentStartGap: spacing.xl + spacing.lg,
  bannerTickerMinHeight: (typography.label.lineHeight + spacing.lg) * 2,
  bannerImageAspectRatio: 3,
  bannerImageMaxHeight: 360,
} as const;

export type BoardThemeKey =
  | "pastel-peach"
  | "pastel-mint"
  | "pastel-sky"
  | "pastel-lilac"
  | "pastel-lemon";

export const boardThemes: Record<
  BoardThemeKey,
  { background: string; surface: string }
> = {
  "pastel-peach": { background: "#fff4ef", surface: "#fff9f6" },
  "pastel-mint": { background: "#f1fff8", surface: "#f8fffb" },
  "pastel-sky": { background: "#eef7ff", surface: "#f8fbff" },
  "pastel-lilac": { background: "#f8f2ff", surface: "#fcf8ff" },
  "pastel-lemon": { background: "#fffcee", surface: "#fffdf5" },
};

export function normalizeBoardTheme(
  value: string | null | undefined,
): BoardThemeKey {
  if (
    value === "pastel-peach" ||
    value === "pastel-mint" ||
    value === "pastel-sky" ||
    value === "pastel-lilac" ||
    value === "pastel-lemon"
  ) {
    return value;
  }
  return "pastel-sky";
}

export const responsive = {
  minSafeWidth: spacing.none,
  authWebSafeInset: spacing.xxl * 5,
  authCardWebSafeInset: spacing.xxl * 7,
  roleWebSafeInset: spacing.xxl * 7,
} as const;

export const controls = {
  radioSize: 18,
  iconButton: tapMin,
  backButton: 44,
  inputHeight: 48,
  multilineInputMinHeight: 96,
  compactChipHeight: 36,
  fab: 56,
  closeButton: 36,
} as const;

export const borders = {
  none: 0,
  hairline: 1,
  medium: 2,
} as const;

export const states = {
  disabledOpacity: 0.55,
  pressedOpacity: 0.82,
  pressedScale: 0.96,
  visibleOpacity: 1,
} as const;

export const layers = {
  badge: 2,
  overlayControl: 10,
  mediaControl: 12,
  bottomNav: 20,
} as const;

export const media = {
  cardImageHeight: 160,
  previewThumb: 64,
  previewAspectRatio: 16 / 9,
  playOffset: 2,
} as const;

export const cardDetail = {
  closeButtonOffset: 20,
  iconButtonSize: 44,
  closeIconSize: 18,
  closeStrokeWidth: 15,
  iconStrokeWidth: 2,
  iconStrokeHeight: 2,
  fullscreenGlyphSize: 20,
  fullscreenCornerSize: 8,
  fullscreenCornerInset: 1,
  mediaMinHeight: 260,
  mediaWideMinHeight: 420,
  mediaOnlyMinHeight: 520,
  mediaAspectRatio: 16 / 9,
  mediaMaxHeight: "70%",
  mediaNavWidth: 48,
  mediaNavHeight: 64,
  mediaNavHalfHeight: -32,
  mediaNavLightOpacity: 0.62,
  mediaNavDarkOpacity: 0.72,
  mediaNavPressedScale: 1.12,
  mediaNavArrowFontSize: 38,
  mediaNavArrowLineHeight: 44,
  mediaDotsGap: 6,
  mediaDotsPaddingVertical: 6,
  mediaDotSize: 7,
  mediaDotHitSize: 24,
  mediaDotActiveWidth: 18,
  railWidth: 280,
  railStackedMediaOnlyMaxHeight: "34%",
  metaMinHeight: 24,
  engagementLikeMinHeight: 38,
  likeButtonMinHeight: 36,
  commentInputMinHeight: 56,
  lightboxImageWidth: "94%",
  lightboxImageHeight: "82%",
  lightboxNavWidth: 52,
  lightboxNavHeight: 72,
  lightboxNavHalfHeight: -36,
} as const;

export const sizing = {
  authorChipMaxWidth: 120,
} as const;

export const brand = {
  logoSize: 36,
  lockupLogoSize: 32,
  logoRadiusRatio: 0.22,
} as const;

export const auth = {
  codeLength: 6,
  cardMaxWidth: 420,
  qrFrameMaxWidth: 320,
  scanCornerSize: 32,
  scanCornerBorderWidth: 3,
} as const;

export const composer = {
  sheetMaxWidth: 720,
  sheetMaxHeight: "92%",
  formMaxHeight: 520,
  contentMinHeight: 120,
} as const;

export const dj = {
  pollIntervalMs: 2000,
  rankingLimit: 8,
  compactBreakpoint: 760,
  mediaAspectRatio: 16 / 9,
  nowPlayerWidth: 320,
  nowPlayerMaxWidth: "52%",
  nowPlayerCompactWidth: "100%",
  nowPlayerCompactMaxWidth: "100%",
  nowThumbWidth: 240,
  nowThumbHeight: 135,
  queueRankWidth: 24,
  queueThumbWidth: 56,
  queueThumbHeight: 42,
  sideWidth: 300,
  rankingPositionWidth: 22,
  rankingAvatarSize: 22,
  drawerWidth: 360,
  drawerThumbWidth: 44,
  drawerThumbHeight: 34,
  compactIconButton: tapMin,
} as const;

export const recap = {
  modalMaxWidth: 720,
  modalMaxHeight: "92%",
  statMinWidth: 120,
  spotMinWidth: 200,
  spotThumbWidth: 120,
  spotThumbHeight: 68,
  spotAvatarSize: 72,
  songThumbWidth: 56,
  songThumbHeight: 32,
  rankAvatarSize: 28,
  positionWidth: 28,
  barsHeight: 80,
  barMinPercent: 3,
  barFullPercent: 100,
} as const;

export const dashboard = {
  showcaseLimit: 10,
  showcaseFeedLimit: 50,
  columns: {
    one: 560,
    two: 920,
    three: 1280,
  },
  showcaseCardWidth: 310,
  showcaseCardMinHeight: 282,
  showcasePreviewHeight: 150,
  compactCardSize: 240,
  showcaseSkeletonHeight: 282,
  badgeSize: 24,
  playSize: 48,
  authorMaxWidth: 120,
  dutyMinHeight: 74,
  dutyIconWidth: 36,
  dutyCtaOpacity: 0.8,
  boardMinHeight: 88,
  boardThumbAspectRatio: 16 / 10,
} as const;

export const navigation = {
  headerHeight: 68,
} as const;

export const studentNav = {
  tabMinWidth: 72,
  dutyTabMaxWidth: 128,
  notificationButtonSize: 40,
  notificationBadgeSize: 18,
  notificationUnreadDotSize: 8,
  inspectionNumberWidth: 28,
  canvaCardMaxWidth: 480,
} as const;

export const walking = {
  iconBadgeSize: 48,
  chartBarHeight: 10,
  chartDayLabelWidth: 72,
  chartStepLabelWidth: 76,
  summaryCardMinWidth: 140,
} as const;

export const store = {
  headerHeight: 72,
  itemCardWidth: 160,
  itemCardMinHeight: 154,
  itemImageHeight: 72,
  scannerHeight: 280,
  scanStatusMinHeight: 56,
  actionMinHeight: 50,
  qtyValueWidth: 24,
} as const;

export const bank = {
  studentRowMinHeight: 56,
  studentNumberWidth: 36,
  inputMinHeight: 48,
  actionMinHeight: 46,
} as const;

export const check = {
  taskCardWidth: 236,
  taskCardMinHeight: 118,
  rosterNumberWidth: 36,
  markSize: 28,
  progressHeight: 8,
} as const;

export const wallet = {
  headerHeight: 72,
  summaryMinHeight: 132,
  qrCodeSize: 220,
  qrFrameSize: 252,
} as const;

export const parent = {
  linkCodeLength: 5,
  navMinWidth: 80,
  feedHeaderNameMaxWidth: 120,
  feedChildNameMaxWidth: 84,
  feedTabMinHeight: 52,
  feedPostHeaderMinHeight: 60,
  feedAvatarSize: 40,
  feedPlayButtonSize: 56,
  childAvatarSize: 48,
  childDetailAvatarSize: 56,
  doneIconSize: 56,
  emptyIconSize: 48,
  portfolioCardWidth: "31.8%",
  portfolioCardMinWidth: 220,
  portfolioImageHeight: 132,
  portfolioEmptyMinHeight: 180,
} as const;

export const portfolio = {
  rosterChipWidth: 176,
  rosterChipMinHeight: 74,
  cardWidth: 300,
  cardMinHeight: 300,
} as const;

export const quiz = {
  pollIntervalMs: 2000,
  roomCodeLetterSpacing: 0,
  cardMinHeight: 120,
  optionWidth: "48%",
  optionDimOpacity: 0.4,
  leaderboardMaxWidth: 400,
  leaderboardPreviewCount: 5,
  rankWidth: 28,
} as const;

export const assignment = {
  peerBreakpoints: {
    one: 560,
    two: 840,
    three: 1120,
  },
  previewAspectRatio: 16 / 9,
  peerDotSize: 10,
  modalMaxWidth: 720,
  contentInputMinHeight: 120,
} as const;

export const columns = {
  columnWidth: 312,
  countPillMinWidth: 24,
} as const;

export const vibe = {
  galleryPaneWidth: 280,
  compactBreakpoint: 720,
  compactGalleryMaxHeight: 220,
  compactGalleryItemWidth: 180,
  thumbnailAspectRatio: 4 / 3,
  inputMaxHeight: 120,
  modalSpacerWidth: 80,
} as const;

export const plant = {
  railWidth: 44,
  nodeSize: 36,
  lineWidth: 2,
  compareAspectRatio: 4 / 3,
  heroEmojiSize: 48,
  progressHeight: 8,
  editorImageLimit: 10,
  editorModalMaxWidth: 720,
  editorModalMaxHeight: "92%",
  editorImageSize: 80,
  editorRemoveSize: 22,
  editorMemoMinHeight: 120,
  noPhotoReasonMaxWidth: 400,
  observationThumbWidth: 80,
  observationThumbHeight: 60,
  lightboxHeightRatio: 0.75,
  lightboxImageWidthRatio: 0.92,
  lightboxImageHeightRatio: 0.7,
  lightboxCloseBottom: 60,
  observationCardWidth: 220,
  roadmapStepWidth: 64,
  roadmapStepMinHeight: 72,
} as const;
