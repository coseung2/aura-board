import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PublicSupabaseClient = SupabaseClient;

const clientCache = new Map<string, PublicSupabaseClient>();

function hashClientCacheKey(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function createConfiguredPublicSupabaseClient(
  headers?: Record<string, string>,
): PublicSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are required",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `aura-public-${hashClientCacheKey(
        JSON.stringify({
          url,
          key,
          headers: Object.entries(headers ?? {}).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        }),
      )}`,
    },
    global: {
      headers,
    },
  });
}

function getClientCacheKey(headers?: Record<string, string>): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return JSON.stringify({
    url,
    key,
    headers: Object.entries(headers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  });
}

export function createPublicSupabaseClient(
  headers?: Record<string, string>,
): PublicSupabaseClient {
  const cacheKey = getClientCacheKey(headers);
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = createConfiguredPublicSupabaseClient(headers);
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Creates a client with independent Realtime channel ownership. Use this when
 * a consumer must remove a channel without affecting other module-level users
 * of the same topic on the cached public client.
 */
export function createIsolatedPublicSupabaseClient(
  headers?: Record<string, string>,
): PublicSupabaseClient {
  return createConfiguredPublicSupabaseClient(headers);
}

export function clearPublicSupabaseClientCacheForTests(): void {
  clientCache.clear();
}
