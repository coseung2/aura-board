import type { ParentSecurityRedis } from "../parent-security-store";

type ValueEntry = { value: string; expiresAt: number };
type SortedEntry = { score: number; member: string };

export class MockParentSecurityRedis implements ParentSecurityRedis {
  readonly values = new Map<string, ValueEntry>();
  readonly windows = new Map<string, SortedEntry[]>();
  readonly setCalls: Array<{ key: string; value: string; ex: number }> = [];
  readonly scriptCalls: Array<{ key: string; args: string[] }> = [];

  async get<TData = string>(key: string): Promise<TData | null> {
    const entry = this.values.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value as TData;
  }

  async set(
    key: string,
    value: string,
    options: { ex: number; nx: true },
  ): Promise<"OK" | null> {
    this.setCalls.push({ key, value, ex: options.ex });
    if (await this.get(key)) return null;
    this.values.set(key, { value, expiresAt: Date.now() + options.ex * 1000 });
    return "OK";
  }

  createScript<TResult = unknown>(script: string): {
    eval(keys: string[], args: string[]): Promise<TResult>;
  } {
    return {
      eval: async (keys, args) => {
        const key = keys[0];
        this.scriptCalls.push({ key, args });

        if (script.includes('redis.call("GET", KEYS[1])')) {
          const entry = this.values.get(key);
          const value = entry && entry.expiresAt > Date.now() ? entry.value : null;
          if (entry && entry.expiresAt <= Date.now()) this.values.delete(key);
          const expected = args[0];
          if (!value?.startsWith(expected)) return null as TResult;
          this.values.delete(key);
          return value.slice(expected.length) as TResult;
        }

        const now = Number(args[0]);
        const windowMs = Number(args[1]);
        const entries = (this.windows.get(key) ?? [])
          .filter((entry) => entry.score > now - windowMs)
          .sort((a, b) => a.score - b.score);
        this.windows.set(key, entries);

        if (script.includes("ARGV[4]")) {
          const limit = Number(args[2]);
          if (entries.length >= limit) {
            const retry = Math.max(1, Math.ceil((entries[0].score + windowMs - now) / 1000));
            return [0, retry] as TResult;
          }
          entries.push({ score: now, member: args[3] });
          return [1, 0] as TResult;
        }

        if (script.includes('redis.call("ZADD"')) {
          entries.push({ score: now, member: args[2] });
          return entries.length as TResult;
        }

        const limit = Number(args[2]);
        if (entries.length < limit) return [1, 0] as TResult;
        const retry = Math.max(1, Math.ceil((entries[0].score + windowMs - now) / 1000));
        return [0, retry] as TResult;
      },
    };
  }
}
