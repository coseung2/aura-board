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
  if (candidate === "titles" && activity === "reading") return "titles";
  return "records";
}

export function legacySelfDirectedHref(
  activity: StudentActivityKey,
  params: Omit<SelfDirectedSearchParams, "activity">,
): string {
  const view = normalizeActivityView(activity, params.tab ?? params.view);
  const query = new URLSearchParams({ activity });
  if (view !== "records") query.set("tab", view);
  return `/student/self-directed?${query.toString()}`;
}
