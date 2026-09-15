import { StyleSheet } from "react-native";
import { borders, radii, spacing, tapMin, typography } from "../../theme/tokens";
import {
  songGuessRoomsTheme as rooms,
  songGuessRoomsTypography as roomsType,
  songGuessStudentTheme as song,
} from "../../theme/song-guess";

/** Styles for the board-entry flow (`M0`–`M5`). Room browsing, free-game
 * creation and the created-room screen previously reused the in-game board
 * styles, which left every action as a full-width text button. */
export const songGuessRoomsStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: song.bg },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: song.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    backgroundColor: song.bg,
  },

  header: { gap: spacing.xs },
  eyebrow: {
    ...typography.micro,
    color: song.accent,
    letterSpacing: rooms.eyebrowLetterSpacing,
  },
  title: { ...typography.display, color: song.text },
  subtitle: { ...typography.body, color: song.muted },

  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: song.answerRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },
  cardSelected: {
    borderWidth: rooms.genreSelectedBorderWidth,
    borderColor: song.accent,
  },
  panelCard: {
    gap: spacing.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderRadius: song.panelRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },

  quickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  quickIcon: {
    width: rooms.heroIconSize,
    height: rooms.heroIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rooms.heroIconRadius,
    backgroundColor: song.accent,
  },
  quickIconText: { ...typography.title, color: song.bg },
  quickCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  quickTitle: { ...typography.subtitle, color: song.text },
  quickNote: { ...typography.micro, color: song.muted },

  sectionRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: { ...typography.subtitle, color: song.text },

  roomCard: {
    gap: spacing.md,
    padding: spacing.lg,
    minHeight: rooms.roomCardMinHeight,
    borderRadius: song.answerRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },
  roomTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  roomCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  roomName: { ...typography.subtitle, color: song.text },
  roomMeta: { ...typography.micro, color: song.muted },
  roomDivider: {
    height: borders.hairline,
    backgroundColor: song.border,
    opacity: rooms.roomDividerOpacity,
  },
  roomFootRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  roomCount: { ...typography.badge, color: song.accent },
  roomEnter: { ...typography.badge, color: song.text },

  emptyIcon: {
    width: rooms.emptyIconSize,
    height: rooms.emptyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rooms.emptyIconRadius,
    backgroundColor: song.track,
    borderWidth: borders.hairline,
    borderColor: song.accent,
  },
  emptyIconText: { ...typography.display, color: song.accent },
  emptyTitle: { ...typography.title, color: song.text, textAlign: "center" },
  emptyBody: { ...typography.body, color: song.muted, textAlign: "center" },

  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBar: {
    height: rooms.stepBarHeight,
    borderRadius: radii.pill,
    backgroundColor: song.track,
  },
  stepBarActive: { backgroundColor: song.accent },

  genreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  genreCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  genreName: { ...typography.subtitle, color: song.text },
  genreNameSelected: { color: song.accent },
  genreDesc: { ...typography.micro, color: song.muted },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: tapMin,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: song.track,
    borderColor: song.border,
  },
  chipText: { ...typography.badge, color: song.text },
  chipSelected: { backgroundColor: song.accent, borderColor: song.accent },
  chipSelectedText: { color: song.bg },

  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  counterButton: {
    width: rooms.counterButtonSize,
    minWidth: rooms.counterButtonSize,
    minHeight: rooms.counterButtonSize,
    paddingHorizontal: 0,
    borderRadius: radii.pill,
    backgroundColor: song.track,
    borderColor: song.border,
  },
  counterButtonText: { ...typography.title, color: song.text },
  counterValueBox: { alignItems: "center", gap: spacing.xxs },
  counterValue: {
    ...typography.display,
    ...roomsType.countValue,
    color: song.accent,
  },
  counterUnit: { ...typography.micro, color: song.muted },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  summaryKey: { ...typography.badge, color: song.muted },
  summaryValue: { ...typography.label, color: song.text },
  summaryEyebrow: { ...typography.micro, color: song.accent },
  summaryTitle: { ...typography.subtitle, color: song.text },
  summaryNote: { ...typography.micro, color: song.muted },

  readyIcon: {
    width: rooms.readyIconSize,
    height: rooms.readyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rooms.readyIconRadius,
    backgroundColor: song.accent,
  },
  readyIconText: { ...typography.code, ...roomsType.readyGlyph, color: song.bg },
  readyTitle: { ...typography.title, color: song.text, textAlign: "center" },

  petRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  petItem: { alignItems: "center", gap: spacing.xs },
  pet: {
    width: rooms.petSize,
    height: rooms.petSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rooms.petRadius,
    backgroundColor: song.track,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },
  petInitial: { ...typography.section, color: song.accent },
  petName: { ...typography.micro, color: song.muted },

  footer: { gap: spacing.sm, marginTop: spacing.md },
  spacer: { flexGrow: 1, minHeight: spacing.lg },
  muted: { ...typography.body, color: song.muted },
  centerNote: { ...typography.micro, color: song.muted, textAlign: "center" },
  errorText: { ...typography.body, color: song.danger, textAlign: "center" },

  /** The shared `primary`/`secondary` variants resolve to the app-wide blue
   * accent, which reads as a foreign control on this purple surface. */
  primaryAction: {
    borderColor: song.accent,
    backgroundColor: song.accent,
  },
  primaryActionText: { color: song.bg },
  secondaryAction: {
    borderColor: song.border,
    backgroundColor: song.track,
  },
  secondaryActionText: { color: song.text },

  /** Full-screen loading / error / ready states (Figma `N0`-`N2`). */
  stateScreen: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    backgroundColor: song.bg,
  },
  stateCard: {
    gap: spacing.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderRadius: song.panelRadius,
    borderCurve: "continuous",
    backgroundColor: song.surface,
    borderWidth: borders.hairline,
    borderColor: song.border,
  },
  stateCardDanger: {
    borderWidth: rooms.genreSelectedBorderWidth,
    borderColor: song.danger,
  },
  stateIcon: {
    width: rooms.emptyIconSize,
    height: rooms.emptyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: rooms.emptyIconRadius,
    backgroundColor: song.track,
    borderWidth: rooms.genreSelectedBorderWidth,
    borderColor: song.accent,
  },
  stateIconDanger: { borderColor: song.danger },
  stateIconText: { ...typography.display, color: song.accent },
  stateIconTextDanger: { color: song.danger },
  stateTitle: { ...typography.title, color: song.text, textAlign: "center" },
  stateBody: { ...typography.body, color: song.muted, textAlign: "center" },
  stateEyebrow: {
    ...typography.micro,
    color: song.accent,
    letterSpacing: rooms.eyebrowLetterSpacing,
  },
  stateEyebrowDanger: { color: song.danger },
  stateActions: { gap: spacing.sm, width: "100%" },
});
