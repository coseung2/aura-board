"use client";

import { useState, useRef, useCallback } from "react";

export type LinkPreview = {
  title: string | null;
  description: string | null;
  image: string | null;
};

export function useLinkPreview() {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);
  const lastUrl = useRef("");

  const fetchPreview = useCallback((url: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!url || url === lastUrl.current) return;

    try {
      new URL(url);
    } catch {
      setPreview(null);
      setLoading(false);
      return;
    }

    setPreview(null);
    setLoading(true);

    timerRef.current = setTimeout(async () => {
      lastUrl.current = url;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(url)}`,
          { signal: controller.signal }
        );
        if (res.ok && !controller.signal.aborted) {
          const data = await res.json();
          setPreview(data);
        } else if (!controller.signal.aborted) {
          setPreview(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreview(null);
        }
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }, 500);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setPreview(null);
    setLoading(false);
    lastUrl.current = "";
  }, []);

  return { preview, loading, fetchPreview, reset };
}
