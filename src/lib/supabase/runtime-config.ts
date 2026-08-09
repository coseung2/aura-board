type RuntimeEnvironment = Record<string, string | undefined>;

function readRuntimeEnvironment(name: string): string | undefined {
  const value = (process.env as RuntimeEnvironment)[name];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

/** Read server Supabase settings without Next build-time env inlining. */
export function getRuntimeSupabaseUrl(): string | undefined {
  return (
    readRuntimeEnvironment("SUPABASE_URL") ??
    readRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_URL")
  );
}

export function getRuntimeSupabaseServiceRoleKey(): string | undefined {
  return readRuntimeEnvironment("SUPABASE_SERVICE_ROLE_KEY");
}

export function getRuntimeSupabasePublicKey(): string | undefined {
  return (
    readRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    readRuntimeEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
