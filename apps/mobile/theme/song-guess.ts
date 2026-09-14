export const songGuessStudentTheme = {
  bg: "#130E28",
  surface: "#21183C",
  panel: "#19122F",
  text: "#FFFFFF",
  muted: "#C8BEE0",
  accent: "#C8B2FF",
  track: "#2A2048",
  disc: "#160D2B",
  answer1: "#B93247",
  answer2: "#235BC3",
  answer3: "#E8BB41",
  answer4: "#19816D",
  answerDarkText: "#382C14",
  answerBadge: "rgba(255, 255, 255, 0.14)",
  answerNumberBg: "rgba(0, 0, 0, 0.24)",
  answerNumberDarkBg: "rgba(56, 44, 20, 0.24)",
  border: "rgba(255, 255, 255, 0.14)",
  borderStrong: "rgba(255, 255, 255, 0.32)",
  success: "#A9E8B8",
  danger: "#FF9AAA",
  contentMaxWidth: 390,
  answerRadius: 16,
  panelRadius: 24,
  selectedBorderWidth: 3,
  mutedChoiceOpacity: 0.36,
  progressHeight: 5,
  playerCardMinHeight: 150,
  playerRowMinHeight: 104,
  recordSize: 88,
  recordRadius: 44,
  recordBorderWidth: 10,
  recordButtonSize: 30,
  recordButtonRadius: 15,
  answerHeight: 62,
  answerNumberSize: 36,
  lobbyCardMinHeight: 190,
  lobbyHeroPetSize: 104,
  lobbyParticipantPetSize: 52,
  lobbyParticipantNameMaxWidth: 72,
  lobbyParticipantPanelMinHeight: 180,
  finalSummaryMinHeight: 140,
  finalPetSize: 88,
} as const;

/** Board entry, room browsing and free-game creation surface. Mirrors the
 * Figma v2 frames `M0`–`M5` so the first screen a student sees follows the
 * same tokens as the in-game screens instead of raw form controls. */
export const songGuessRoomsTheme = {
  eyebrowLetterSpacing: 0.6,
  heroIconSize: 46,
  heroIconRadius: 14,
  roomCardMinHeight: 126,
  roomDividerOpacity: 0.9,
  emptyIconSize: 72,
  emptyIconRadius: 24,
  readyIconSize: 82,
  readyIconRadius: 28,
  stepBarHeight: 5,
  stepBarActiveFlex: 2,
  stepBarRestFlex: 1,
  genreSelectedBorderWidth: 2,
  genreAccentBarWidth: 4,
  counterButtonSize: 52,
  petSize: 46,
  petRadius: 16,
  countValueFontSize: 30,
  countValueLineHeight: 36,
} as const;

/** Glyph type roles for the room-entry surface. The ready/quick icons are
 * display glyphs rather than body text, so they carry their own scale instead
 * of overriding a semantic role inline. */
export const songGuessRoomsTypography = {
  readyGlyph: {
    fontSize: 34,
    lineHeight: 40,
  },
  countValue: {
    fontSize: 30,
    lineHeight: 36,
  },
} as const;
