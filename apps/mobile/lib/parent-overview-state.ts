import type { ParentChildrenResponse } from "./types";

type ParentSelectableChild = { studentId: string };

export function resolveParentSelectedChildId(
  children: readonly ParentSelectableChild[],
  currentId: string | null,
  storedId: string | null,
  preferStored = false,
): string | null {
  const currentIsValid =
    currentId != null && children.some((child) => child.studentId === currentId);
  const storedIsValid =
    storedId != null && children.some((child) => child.studentId === storedId);

  if (preferStored && storedIsValid) return storedId;
  if (currentIsValid) return currentId;
  if (storedIsValid) return storedId;
  return children[0]?.studentId ?? null;
}

export function removeParentLinkFromOverview(
  overview: ParentChildrenResponse,
  linkId: string,
): ParentChildrenResponse {
  return {
    parent: overview.parent,
    children: overview.children.filter((child) => child.id !== linkId),
    pendingLinks: overview.pendingLinks.filter((link) => link.id !== linkId),
  };
}
