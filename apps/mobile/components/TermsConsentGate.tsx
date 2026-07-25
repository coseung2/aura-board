import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { AppButton, TextActionPressable } from "./ui";
import { LogoLockup } from "./LogoLockup";
import { getApiBase } from "../lib/api";
import {
  acceptCurrentTerms,
  isTermsAccepted,
  loadAcceptedTermsVersion,
} from "../lib/terms-consent";
import {
  auth,
  borders,
  brand,
  colors,
  iconSizes,
  layers,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";

// Blocking first-run terms gate (App Store guideline 1.2).
//
// Apple's reviewer looks for the agreement "presented to users before
// registering or logging in", so this renders ahead of the login screen rather
// than as a dismissible notice. It appears once per terms version.

export function TermsConsentGate({
  children,
  bypass = false,
}: {
  children: React.ReactNode;
  bypass?: boolean;
}) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadAcceptedTermsVersion();
      if (active) setAccepted(isTermsAccepted(stored));
    })();
    return () => {
      active = false;
    };
  }, []);

  async function open(path: "/terms" | "/privacy") {
    try {
      await WebBrowser.openBrowserAsync(`${getApiBase()}${path}`);
    } catch {
      // Best-effort; the summary below already states the key rules.
    }
  }

  async function handleAccept() {
    setSaving(true);
    try {
      await acceptCurrentTerms();
      setAccepted(true);
    } catch {
      // If persistence fails the gate simply shows again next launch.
      setAccepted(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.host}>
      <View
        style={styles.childLayer}
        pointerEvents={!bypass && accepted !== true ? "none" : "auto"}
        accessibilityElementsHidden={!bypass && accepted !== true}
      >
        {children}
      </View>

      {!bypass && accepted === null ? (
        <SafeAreaView style={[styles.loadingContainer, styles.overlay]}>
          <ActivityIndicator color={colors.accent} />
        </SafeAreaView>
      ) : null}

      {!bypass && accepted === false ? (
        <SafeAreaView style={[styles.container, styles.overlay]}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandBlock}>
              <LogoLockup size={brand.splashLogoSize} withWordmark={false} />
            </View>

            <View style={styles.intro}>
              <Text style={styles.title}>함께 쓰는 공간의 약속</Text>
              <Text style={styles.body}>
                {"안전하게 사용할 수 있도록\n아래 내용을 확인하세요"}
              </Text>
            </View>

            <View style={styles.rules}>
              <RuleRow
                number="1"
                title="서로를 존중해요"
                description="욕설이나 비방, 개인정보는 올리지 않아요"
              />
              <RuleRow
                number="2"
                title="불편한 내용은 알려요"
                description={"불건전한 글이나 댓글을\n신고하거나 숨길 수 있어요"}
              />
              <RuleRow
                number="3"
                title="선생님이 확인해요"
                description={"신고는 24시간 안에 접수되고,\n규칙을 어긴 내용은 삭제될 수 있어요"}
                last
              />
            </View>

            <View style={styles.links}>
              <TextActionPressable
                style={styles.link}
                onPress={() => void open("/terms")}
                accessibilityRole="link"
                accessibilityLabel="이용약관 전문 보기"
              >
                <Text style={styles.linkLabel}>이용약관</Text>
              </TextActionPressable>
              <View style={styles.linkDivider} accessible={false} />
              <TextActionPressable
                style={styles.link}
                onPress={() => void open("/privacy")}
                accessibilityRole="link"
                accessibilityLabel="개인정보처리방침 보기"
              >
                <Text style={styles.linkLabel}>개인정보처리방침</Text>
              </TextActionPressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.consentText}>
                아래 버튼을 누르면 위 약속과 이용약관에 동의하게 돼요.
              </Text>
              <AppButton
                style={styles.acceptButton}
                onPress={() => void handleAccept()}
                loading={saving}
                disabled={saving}
              >
                동의하고 시작하기
              </AppButton>
            </View>
          </ScrollView>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function RuleRow({
  number,
  title,
  description,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.ruleRow, last && styles.ruleRowLast]}>
      <View style={styles.ruleNumber} accessibilityElementsHidden>
        <Text style={styles.ruleNumberText}>{number}</Text>
      </View>
      <View style={styles.ruleCopy}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  childLayer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.overlayControl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.xl,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingVertical: spacing.xxl,
    width: "100%",
    maxWidth: auth.cardMaxWidth,
    alignSelf: "center",
  },
  brandBlock: {
    alignItems: "center",
  },
  intro: {
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.display,
    color: colors.text,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  rules: {
    width: "100%",
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ruleRowLast: {
    borderBottomWidth: borders.none,
  },
  ruleNumber: {
    width: iconSizes.lg,
    height: iconSizes.lg,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
  },
  ruleNumberText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  ruleCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  ruleTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  ruleDescription: {
    ...typography.body,
    color: colors.textMuted,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  link: {
    minHeight: tapMin,
    justifyContent: "center",
  },
  linkLabel: {
    ...typography.label,
    color: colors.accent,
  },
  linkDivider: {
    width: borders.hairline,
    height: iconSizes.sm,
    backgroundColor: colors.border,
  },
  footer: {
    gap: spacing.md,
  },
  consentText: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "center",
  },
  acceptButton: {
    width: "100%",
  },
});
