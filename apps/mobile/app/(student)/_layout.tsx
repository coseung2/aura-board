import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { colors } from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  hydrateBoardCache,
  readBoardCache,
  revalidateBoardCache,
  writeBoardCache,
} from "../../lib/board-cache";
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
  const hideNav =
    pathname === "/login" ||
    pathname.endsWith("/login") ||
    pathname.includes("/feed/compose");
  const [cacheReady, setCacheReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(
    () =>
      readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, { kind: "boards" })
        ?.data ?? null,
  );

  useEffect(() => {
    let active = true;
    void hydrateBoardCache().finally(() => {
      if (!active) return;
      setMe(
        readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, { kind: "boards" })
          ?.data ?? null,
      );
      setCacheReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadMe = useCallback(async () => {
    if (!cacheReady) return;
    if (hideNav) {
      setMe(null);
      return;
    }
    try {
      const res = await revalidateBoardCache<MeResponse>(
        STUDENT_HOME_CACHE_KEY,
        async () => {
          const response = await apiFetch<MeResponse>("/api/student/me");
          writeBoardCache(BOARD_LIST_CACHE_KEY, response.boards, {
            kind: "boards",
          });
          return response;
        },
        { kind: "boards" },
      );
      setMe(res);
      void recordStudentAttendanceVisit().catch(() => undefined);
    } catch (e) {
      setMe(null);
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
      }
    }
  }, [cacheReady, hideNav, router]);

  useEffect(() => {
    loadMe();
  }, [loadMe, pathname]);

  useEffect(() => {
    if (hideNav) return;
    let unsubscribe: () => void = () => undefined;
    let active = true;
    void registerStudentPushNotifications();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void registerStudentPushNotifications();
    });
    void subscribeStudentPushNavigation((href) => {
      router.push(studentNotificationTarget(href) as Href);
    }).then((next) => {
      if (!active) {
        next();
        return;
      }
      unsubscribe = next;
    });
    return () => {
      active = false;
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [hideNav, router]);

  if (!cacheReady) {
    return <View style={styles.shell} />;
  }

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
        <WalkingPermissionOnboarding accountKey={me.student.id} role="student" />
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
