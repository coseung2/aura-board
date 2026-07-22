// PV-9 — parent client fetch wrapper.
//
// All client-side fetch calls from /parent/** UIs should go through this
// helper. On a 401 (revoked / expired session), we fire a CustomEvent that
// the SessionWatchdog component listens for, causing an immediate redirect
// to the canonical /login UI — no waiting for the next 45s poll tick.
//
// Usage:
//   const res = await parentFetch(`/api/parent/children/${id}/posts?kind=media`);
//   if (!res) return; // redirect already triggered, bail out
//   const data = await res.json();

export async function parentFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  const res = await fetch(input, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("parent-auth-lost"));
    }
    return null;
  }
  return res;
}
