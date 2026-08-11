import * as WebBrowser from "expo-web-browser";
import Svg from "react-native-svg";
import { BookOpen } from "lucide-react-native";
import { House } from "lucide-react-native";
import { Path } from "react-native-svg";
import { Text } from "react-native";
import { TextActionPressable } from "../components/ui";
import { View } from "react-native";
import { colors } from "../theme/tokens";
import { getApiBase } from "../lib/api";
import { iconSizes } from "../theme/tokens";
import { styles } from "./landing.styles";

/**
 * Terms notice shown below every login control (App Store guideline 1.2
 * requires the agreement to be presented before login). The full-screen
 * first-run gate lives in components/TermsConsentGate.tsx; this line keeps the
 * agreement reachable on every later visit.
 */
export function TermsNotice() {
  async function open(path: "/terms" | "/privacy") {
    try {
      await WebBrowser.openBrowserAsync(`${getApiBase()}${path}`);
    } catch {
      // Opening the policy is best-effort; login must never be blocked by it.
    }
  }

  return (
    <View style={styles.termsNotice}>
      <TextActionPressable
        style={styles.termsNoticeLinkButton}
        accessibilityRole="link"
        accessibilityLabel="이용약관 열기"
        onPress={() => void open("/terms")}
      >
        <Text style={styles.termsNoticeLink}>이용약관</Text>
      </TextActionPressable>
      <View style={styles.termsNoticeDivider} accessible={false} />
      <TextActionPressable
        style={styles.termsNoticeLinkButton}
        accessibilityRole="link"
        accessibilityLabel="개인정보처리방침 열기"
        onPress={() => void open("/privacy")}
      >
        <Text style={styles.termsNoticeLink}>개인정보처리방침</Text>
      </TextActionPressable>
    </View>
  );
}

export function RoleLineIcon({ role }: { role: "student" | "parent" }) {
  const Icon = role === "student" ? BookOpen : House;
  return (
    <Icon
      size={iconSizes.hero}
      color={colors.text}
      strokeWidth={2}
      accessible={false}
    />
  );
}

export function GoogleGlyph() {
  return (
    <Svg
      width={iconSizes.md}
      height={iconSizes.md}
      viewBox="0 0 24 24"
      accessibilityLabel="Google"
    >
      <Path
        fill={colors.oauthGoogle}
        d="M21.6 12.227c0-.708-.064-1.39-.182-2.045H12v3.868h5.385a4.604 4.604 0 0 1-1.997 3.022v2.51h3.231c1.891-1.741 2.981-4.307 2.981-7.355z"
      />
      <Path
        fill={colors.plantActive}
        d="M12 22c2.7 0 4.964-.895 6.619-2.418l-3.231-2.51c-.895.6-2.04.954-3.388.954-2.605 0-4.81-1.76-5.598-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"
      />
      <Path
        fill={colors.warning}
        d="M6.402 13.903a6.005 6.005 0 0 1 0-3.806v-2.59H3.064a9.998 9.998 0 0 0 0 8.987l3.338-2.59z"
      />
      <Path
        fill={colors.danger}
        d="M12 5.977c1.469 0 2.786.505 3.823 1.495l2.866-2.866C16.96 2.99 14.696 2 12 2A9.998 9.998 0 0 0 3.064 7.508l3.338 2.59C7.19 7.736 9.395 5.977 12 5.977z"
      />
    </Svg>
  );
}

export function KakaoGlyph() {
  return (
    <Svg
      width={iconSizes.md}
      height={iconSizes.md}
      viewBox="0 0 24 24"
      accessibilityLabel="Kakao"
    >
      <Path
        fill={colors.text}
        d="M12 4C7.03 4 3 7.21 3 11.16c0 2.6 1.74 4.87 4.34 6.13l-.83 3.06c-.07.27.22.49.46.34l3.62-2.4c.46.05.93.07 1.41.07 4.97 0 9-3.21 9-7.2C21 7.21 16.97 4 12 4z"
      />
    </Svg>
  );
}
