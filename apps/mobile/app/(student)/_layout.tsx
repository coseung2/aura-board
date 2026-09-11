import type { Href } from "expo-router";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DailyBannerProvider } from "../../components/DailyBanner";
import { StudentBottomNav } from "../../components/StudentBottomNav";
import { WalkingPermissionOnboarding } from "../../components/WalkingPermissionOnboarding";
import { InputFeedbackProvider } from "../../components/input-feedback-provider";
import { AppButton } from "../../components/ui";
import { ApiError, apiFetch } from "../../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  hydrateBoardCache,
  readBoardCache,
  revalidateBoardCache,
  writeBoardCache,
} from "../../lib/board-cache";
import { restrictedStudentPath } from "../../lib/product-access";
import { ProductAccessContext } from "../../lib/product-access-context";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { recordStudentAttendanceVisit } from "../../lib/student-attendance";
import { studentNotificationTarget } from "../../lib/student-notifications";
import {
  registerStudentPushNotifications,
  subscribeStudentPushNavigation,
} from "../../lib/student-push-notifications";
import type { MeResponse } from "../../lib/types";
import { FeedEditorProvider } from "../../screens/student/feed-editor-context";
import { colors } from "../../theme/tokens";

// Student segment 전체 공통 layout.
export default function StudentLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const hideNav =
    pathname === "/login" ||
    pathname.endsWith("/login") ||
    pathname.includes("/feed/compose") ||
    pathname.endsWith("/compose") ||
    pathname.endsWith("/edit") ||
    pathname.endsWith("/comments") ||
    pathname.endsWith("/submit");
  const [cacheReady, setCacheReady] = useState(false);
  const [accessError, setAccessError] = useState(false);
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
    setAccessError(false);
    try {
      const res = await revalidateBoardCache<MeResponse>(
        STUDENT_HOME_CACHE_KEY,
        async () => {
          const response = await apiFetch<MeResponse>("/api/student/me");
          writeBoardCache(
            BOARD_LIST_CACHE_KEY,
            {
              boards: response.boards,
              classroomName: response.student.classroom?.name ?? null,
              productCapabilities: response.productCapabilities,
              availableLayouts: response.availableLayouts,
            },
            {
              kind: "boards",
            },
          );
          return response;
        },
        {
          kind: "boards",
          force: !readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY)?.data
            .productCapabilities,
        },
      );
      if (!res.productCapabilities || !res.availableLayouts) {
        throw new Error("product_policy_missing");
      }
      setMe(res);
      void recordStudentAttendanceVisit().catch(() => undefined);
    } catch (e) {
      setAccessError(true);
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
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
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void registerStudentPushNotifications();
      },
    );
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
  if (!me?.productCapabilities || !me.availableLayouts) {
    return (
      <View style={styles.accessGate}>
        {accessError ? (
          <>
            <Text accessibilityRole="alert">
              계정 정보를 확인하지 못했어요.
            </Text>
            <AppButton onPress={() => void loadMe()}>다시 시도</AppButton>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="계정 정보 확인 중" />
        )}
      </View>
    );
  }
  if (restrictedStudentPath(pathname, me)) {
    return <Redirect href="/(student)" />;
  }

  return (
    <View style={styles.shell}>
      <InputFeedbackProvider>
        <FeedEditorProvider>
          <ProductAccessContext.Provider value={me}>
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
          </ProductAccessContext.Provider>
          {!hideNav ? (
            <StudentBottomNav duties={me?.duties} access={me} />
          ) : null}
          {!hideNav && me ? (
            <WalkingPermissionOnboarding
              accountKey={me.student.id}
              role="student"
            />
          ) : null}
        </FeedEditorProvider>
      </InputFeedbackProvider>
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
  accessGate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
});
