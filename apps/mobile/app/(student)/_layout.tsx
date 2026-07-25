import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { colors } from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import { StudentBottomNav } from "../../components/StudentBottomNav";
import { WalkingPermissionOnboarding } from "../../components/WalkingPermissionOnboarding";
import { DailyBannerProvider } from "../../components/DailyBanner";
import { recordStudentAttendanceVisit } from "../../lib/student-attendance";
import {
  registerStudentPushNotifications,
  subscribeStudentPushNavigation,
} from "../../lib/student-push-notifications";
import { studentNotificationTarget } from "../../lib/student-notifications";
import type { Href } from "expo-router";

// Student segment 전체 공통 layout.
export default function StudentLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hideNav = pathname === "/login" || pathname.endsWith("/login");
  const [me, setMe] = useState<MeResponse | null>(null);

  const loadMe = useCallback(async () => {
    if (hideNav) {
      setMe(null);
      return;
    }
    try {
      const res = await apiFetch<MeResponse>("/api/student/me");
      setMe(res);
      void recordStudentAttendanceVisit().catch(() => undefined);
    } catch (e) {
      setMe(null);
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
      }
    }
  }, [hideNav, router]);

  useEffect(() => {
    loadMe();
  }, [loadMe, pathname]);

  useEffect(() => {
    if (hideNav) return;
    let unsubscribe: () => void = () => undefined;
    void registerStudentPushNotifications();
    void subscribeStudentPushNavigation((href) => {
      router.push(studentNotificationTarget(href) as Href);
    }).then((next) => {
      unsubscribe = next;
    });
    return () => unsubscribe();
  }, [hideNav, router]);

  return (
    <View style={styles.shell}>
      <DailyBannerProvider role="student">
        <View style={styles.stack}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "fade",
            }}
          />
        </View>
      </DailyBannerProvider>
      {!hideNav ? (
        <StudentBottomNav duties={me?.duties} />
      ) : null}
      {!hideNav && me ? (
        <WalkingPermissionOnboarding studentId={me.student.id} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stack: {
    flex: 1,
  },
});
