import type {
  StudentActivityKey,
  StudentActivityView,
} from "@/components/student/StudentActivityHeader";

export type SelfDirectedSearchParams = {
  activity?: string | string[];
  tab?: string | string[];
  view?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeSelfDirectedActivity(
  value: string | string[] | undefined,
): StudentActivityKey {
  return first(value) === "walking" ? "walking" : "reading";
}

export function normalizeActivityView(
  activity: StudentActivityKey,
  value: string | string[] | undefined,
): StudentActivityView {
  const candidate = first(value);
  if (candidate === "missions") return "missions";
  if (candidate === "titles") return "titles";
  return "records";
}

export function legacySelfDirectedHref(
  activity: StudentActivityKey,
  params: Omit<SelfDirectedSearchParams, "activity">,
): string {
  const view = normalizeActivityView(activity, params.tab ?? params.view);
  const query = new URLSearchParams();
  if (view !== "records") query.set("tab", view);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/student/${activity}${suffix}`;
}
