import { getApiBase, parentApiFetch } from "./api";
import {
  PARENT_OVERVIEW_CACHE_KEY,
  PARENT_READING_CACHE_KEY,
  PARENT_WALKING_CACHE_KEY,
  parentPostCollectionCacheKey,
  revalidateParentDataCache,
} from "./parent-data-cache";
import type {
  ParentChildrenResponse,
  ParentFeedResponse,
  ParentReadingResponse,
  ParentWalkingResponse,
} from "./types";

const PARENT_FEED_ENDPOINT = "/api/parent/feed";
const PREFETCH_PAGE_SIZE = 10;

function localParentPath(path: string): string {
  return __DEV__ ? `${getApiBase()}${path}` : path;
}

/** Warm the four primary parent tabs after the first screen transition settles. */
export async function prefetchParentTabs(): Promise<void> {
  await Promise.allSettled([
    revalidateParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      () => parentApiFetch<ParentChildrenResponse>("/api/parent/children"),
      { kind: "overview" },
    ),
    revalidateParentDataCache(
      parentPostCollectionCacheKey(PARENT_FEED_ENDPOINT),
      () =>
        parentApiFetch<ParentFeedResponse>(
          `${PARENT_FEED_ENDPOINT}?limit=${PREFETCH_PAGE_SIZE}`,
        ),
      { kind: "feed" },
    ),
    revalidateParentDataCache(
      PARENT_READING_CACHE_KEY,
      () =>
        parentApiFetch<ParentReadingResponse>(
          localParentPath("/api/parent/reading"),
        ),
      { kind: "reading" },
    ),
    revalidateParentDataCache(
      PARENT_WALKING_CACHE_KEY,
      () =>
        parentApiFetch<ParentWalkingResponse>(
          localParentPath("/api/parent/walking"),
        ),
      { kind: "walking" },
    ),
  ]);
}
