import { Platform } from "react-native";
import { StyleSheet } from "react-native";
import { borders } from "../theme/tokens";
import { colors } from "../theme/tokens";
import { iconSizes } from "../theme/tokens";
import { layout } from "../theme/tokens";
import { radii } from "../theme/tokens";
import { spacing } from "../theme/tokens";
import { tapMin } from "../theme/tokens";
import { typography } from "../theme/tokens";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bootingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  bootingText: { ...typography.body, color: colors.textMuted },
  inner: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  loginHeader: {
    width: "100%",
    maxWidth: layout.roleCardNarrowMaxWidth - spacing.xxl * 2,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.bg,
  },
  topLogo: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  loginBrandTitle: {
    ...typography.title,
    fontFamily: Platform.select({
      android: "sans-serif-rounded",
      default: typography.title.fontFamily,
    }),
    color: colors.text,
    textAlign: "center",
  },
  roleNav: {
    width: "100%",
  },
  roleNavItem: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  cardRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  cardRowNarrow: {
    flexDirection: "column",
    width: "100%",
    maxWidth: layout.roleCardNarrowMaxWidth,
  },
  roleCard: {
    width: layout.roleCardWidth,
    minHeight: layout.roleCardMinHeight,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  parentRoleCard: {
    width: layout.roleCardNarrowMaxWidth,
  },
  roleCardNarrow: {
    width: "100%",
  },
  hiddenRoleCard: {
    display: "none",
  },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  termsNotice: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  termsNoticeCopy: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  termsNoticeLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  termsNoticeLinkButton: {
    minHeight: tapMin,
    justifyContent: "center",
  },
  termsNoticeDivider: {
    width: borders.hairline,
    height: iconSizes.sm,
    backgroundColor: colors.border,
  },
  termsNoticeLink: {
    ...typography.label,
    color: colors.accent,
  },
  studentLoginForm: {
    width: "100%",
    gap: spacing.sm,
    alignItems: "center",
  },
  studentCodeInput: {
    width: "100%",
    backgroundColor: colors.surface,
    textAlign: "center",
    fontFamily: typography.subtitle.fontFamily,
    fontSize: typography.subtitle.fontSize,
    fontWeight: typography.subtitle.fontWeight,
  },
  studentErrorText: {
    ...typography.micro,
    color: colors.danger,
    textAlign: "center",
  },
  parentErrorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  studentLoginButton: {
    width: "100%",
  },
  oauthActions: {
    width: "100%",
    gap: spacing.sm,
  },
  oauthButton: {
    width: "100%",
    minHeight: tapMin,
    borderRadius: radii.btn,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  oauthApple: {
    width: "100%",
    height: tapMin,
  },
  credentialForm: {
    width: "100%",
    gap: spacing.sm,
  },
  credentialModeActions: {
    width: "100%",
    alignItems: "center",
    gap: spacing.xs,
  },
  credentialTextAction: {
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  credentialTextActionLabel: {
    ...typography.body,
    color: colors.accent,
    textAlign: "center",
  },
  oauthGoogle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  oauthKakao: {
    borderColor: colors.oauthKakao,
    backgroundColor: colors.oauthKakao,
  },
  oauthGoogleText: {
    ...typography.label,
    color: colors.text,
  },
  oauthKakaoText: {
    ...typography.label,
    color: colors.text,
  },
});
