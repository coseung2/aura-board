import type { ParentChildrenResponse } from "./types";

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
