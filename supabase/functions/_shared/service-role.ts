// Only callers holding one of the project's secret keys may run the sync functions
// (Shawn, 2026-10-24). Supabase's own JWT check lets any valid JWT through, including
// the public anon key, and it can't read Supabase's new `sb_secret_...` keys at all.
// So nps-sync and ridb-sync run with verify_jwt = false (supabase/config.toml) and
// check the caller here instead (widened 2026-11-14 for the new keys).
//
// A caller sends a secret key on the `apikey` header (Supabase's documented way for the
// new keys) or as `Authorization: Bearer <key>`. It's accepted if it equals any key in
// SUPABASE_SECRET_KEYS (a JSON object of name -> key) or SUPABASE_SERVICE_ROLE_KEY.

type Env = { get(name: string): string | undefined };

/** Every key that may run a sync: all named secret keys, then the legacy service role key. */
export function secretKeysFromEnv(env: Env): string[] {
  const keys: string[] = [];
  const json = env.get("SUPABASE_SECRET_KEYS");
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value) keys.push(value);
        }
      }
    } catch {
      // A malformed value adds no keys; the legacy key below still counts.
    }
  }
  const legacy = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) keys.push(legacy);
  return keys;
}

/** The key the sync builds its admin client with: the `default` secret key, else the legacy one. */
export function adminKeyFromEnv(env: Env): string | undefined {
  const json = env.get("SUPABASE_SECRET_KEYS");
  if (json) {
    try {
      const value = (JSON.parse(json) as Record<string, unknown>)?.["default"];
      if (typeof value === "string" && value) return value;
    } catch {
      // Fall back to the legacy key.
    }
  }
  return env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
}

export function isServiceRoleRequest(req: Request, keys: string[]): boolean {
  const presented: string[] = [];
  const apikey = req.headers.get("apikey");
  if (apikey) presented.push(apikey);
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) presented.push(auth.slice("Bearer ".length));
  return presented.some((p) => p !== "" && keys.some((k) => k !== "" && sameString(p, k)));
}

// Constant-time comparison, so response timing doesn't leak how much of a key matched.
function sameString(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
