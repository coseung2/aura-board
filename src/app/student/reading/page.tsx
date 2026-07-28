import { redirect } from "next/navigation";

import {
  legacySelfDirectedHref,
  type SelfDirectedSearchParams,
} from "../self-directed/navigation";

export default async function LegacyStudentReadingPage({
  searchParams,
}: {
  searchParams: Promise<Omit<SelfDirectedSearchParams, "activity">>;
}) {
  redirect(legacySelfDirectedHref("reading", await searchParams));
}
