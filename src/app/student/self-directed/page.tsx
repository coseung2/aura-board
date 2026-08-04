import { redirect } from "next/navigation";

import {
  legacySelfDirectedHref,
  normalizeSelfDirectedActivity,
  type SelfDirectedSearchParams,
} from "./navigation";

export default async function StudentSelfDirectedPage({
  searchParams,
}: {
  searchParams: Promise<SelfDirectedSearchParams>;
}) {
  const query = await searchParams;
  const activity = normalizeSelfDirectedActivity(query.activity);
  redirect(
    legacySelfDirectedHref(activity, {
      tab: query.tab,
      view: query.view,
    }),
  );
}
