"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type ShareSession = {
  shareToken: string;
  shareMode: "student";
  guestId: string | null;
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
  const [guestId, setGuestId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("방문자");

  useEffect(() => {
    let id = window.localStorage.getItem(SHARE_GUEST_ID_KEY);
    if (!id) {
      id = createGuestId();
      window.localStorage.setItem(SHARE_GUEST_ID_KEY, id);
    }
    setGuestId(id);
    setAuthorName(window.localStorage.getItem(SHARE_AUTHOR_NAME_KEY) || "방문자");
  }, []);

  const value = useMemo(
    () => ({ shareToken, shareMode, guestId, authorName }),
    [authorName, guestId, shareMode, shareToken],
  );

  return (
    <ShareSessionContext.Provider value={value}>
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
