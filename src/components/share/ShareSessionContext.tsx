"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ShareSession = {
  shareToken: string;
  shareMode: "student";
  guestId: string;
  authorName: string;
};

const SHARE_GUEST_ID_KEY = "aura-share-guest-id";
const SHARE_AUTHOR_NAME_KEY = "aura-share-author-name";

const ShareSessionContext = createContext<ShareSession | null>(null);

function createGuestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ShareSessionProvider({
  shareToken,
  shareMode,
  children,
}: {
  shareToken: string;
  shareMode: "student";
  children: ReactNode;
}) {
  const [guestId, setGuestId] = useState(() => getOrCreateStoredGuestId());
  const [authorName, setAuthorName] = useState(() => getStoredAuthorName());

  useEffect(() => {
    setGuestId(getOrCreateStoredGuestId());
    setAuthorName(getStoredAuthorName());
  }, []);

  const value = useMemo(
    () => ({ shareToken, shareMode, guestId, authorName }),
    [authorName, guestId, shareMode, shareToken],
  );

  return (
    <ShareSessionContext.Provider value={value}>
      <ShareFetchBridge session={value} />
      {children}
    </ShareSessionContext.Provider>
  );
}

export function useShareSession(): ShareSession | null {
  return useContext(ShareSessionContext);
}

export function useShareFetch() {
  const session = useShareSession();
  return useCallback(
    (url: string | URL, init?: RequestInit) => {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          ...(session ? { "x-share-token": session.shareToken } : {}),
          ...(session?.guestId ? { "x-share-guest-id": session.guestId } : {}),
        },
      });
    },
    [session],
  );
}

function getStoredAuthorName(): string {
  if (typeof window === "undefined") return "방문자";
  return window.localStorage.getItem(SHARE_AUTHOR_NAME_KEY) || "방문자";
}

function getOrCreateStoredGuestId(): string {
  if (typeof window === "undefined") return createGuestId();
  let id = window.localStorage.getItem(SHARE_GUEST_ID_KEY);
  if (!id) {
    id = createGuestId();
    window.localStorage.setItem(SHARE_GUEST_ID_KEY, id);
  }
  return id;
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  const raw = input instanceof Request ? input.url : input.toString();
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function ShareFetchBridge({ session }: { session: ShareSession }) {
  useEffect(() => {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;

    const patchedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isSameOriginApiRequest(input)) {
        return originalFetch.call(window, input, init);
      }

      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set("x-share-token", session.shareToken);
      headers.set("x-share-guest-id", session.guestId);
      headers.set("x-share-author-name", encodeURIComponent(session.authorName));

      return originalFetch.call(window, input, {
        ...init,
        headers,
      });
    };

    window.fetch = patchedFetch;

    return () => {
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, [session]);

  return null;
}
