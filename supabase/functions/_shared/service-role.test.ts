import { assertEquals } from "jsr:@std/assert";
import { adminKeyFromEnv, isServiceRoleRequest, secretKeysFromEnv } from "./service-role.ts";

const SECRET = "sb_secret_default";
const OTHER_SECRET = "sb_secret_worker";
const LEGACY = "legacy-service-role-jwt";
const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/functions/v1/nps-sync", { method: "POST", headers });
const env = (vars: Record<string, string>) => ({ get: (name: string) => vars[name] });
const BOTH = env({
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET, worker: OTHER_SECRET }),
  SUPABASE_SERVICE_ROLE_KEY: LEGACY,
});

Deno.test("secretKeysFromEnv lists every named secret key, then the legacy key", () => {
  assertEquals(secretKeysFromEnv(BOTH), [SECRET, OTHER_SECRET, LEGACY]);
});

Deno.test("secretKeysFromEnv ignores a malformed SUPABASE_SECRET_KEYS and keeps the legacy key", () => {
  assertEquals(secretKeysFromEnv(env({ SUPABASE_SECRET_KEYS: "not json", SUPABASE_SERVICE_ROLE_KEY: LEGACY })), [LEGACY]);
});

Deno.test("secretKeysFromEnv is empty when the function has no keys", () => {
  assertEquals(secretKeysFromEnv(env({})), []);
});

Deno.test("adminKeyFromEnv prefers the default secret key, else the legacy key", () => {
  assertEquals(adminKeyFromEnv(BOTH), SECRET);
  assertEquals(adminKeyFromEnv(env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY })), LEGACY);
  assertEquals(adminKeyFromEnv(env({ SUPABASE_SECRET_KEYS: "{}", SUPABASE_SERVICE_ROLE_KEY: LEGACY })), LEGACY);
  assertEquals(adminKeyFromEnv(env({})), undefined);
});

Deno.test("isServiceRoleRequest accepts a secret key on the apikey header", () => {
  const keys = secretKeysFromEnv(BOTH);
  assertEquals(isServiceRoleRequest(req({ apikey: SECRET }), keys), true);
  assertEquals(isServiceRoleRequest(req({ apikey: OTHER_SECRET }), keys), true);
});

Deno.test("isServiceRoleRequest accepts a secret or legacy key as a bearer token", () => {
  const keys = secretKeysFromEnv(BOTH);
  assertEquals(isServiceRoleRequest(req({ Authorization: `Bearer ${SECRET}` }), keys), true);
  assertEquals(isServiceRoleRequest(req({ Authorization: `Bearer ${LEGACY}` }), keys), true);
});

Deno.test("isServiceRoleRequest refuses the anon or publishable key, or any other token", () => {
  const keys = secretKeysFromEnv(BOTH);
  assertEquals(isServiceRoleRequest(req({ apikey: "sb_publishable_x" }), keys), false);
  assertEquals(isServiceRoleRequest(req({ Authorization: "Bearer anon-key" }), keys), false);
  assertEquals(isServiceRoleRequest(req({ apikey: `${SECRET}x` }), keys), false);
  assertEquals(isServiceRoleRequest(req({ apikey: SECRET.slice(0, -1) }), keys), false);
});

Deno.test("isServiceRoleRequest refuses a request with no key", () => {
  assertEquals(isServiceRoleRequest(req(), secretKeysFromEnv(BOTH)), false);
  assertEquals(isServiceRoleRequest(req({ Authorization: "Bearer " }), secretKeysFromEnv(BOTH)), false);
});

Deno.test("isServiceRoleRequest refuses everything when the function has no keys", () => {
  assertEquals(isServiceRoleRequest(req({ apikey: "undefined" }), []), false);
  assertEquals(isServiceRoleRequest(req({ Authorization: "Bearer " }), [""]), false);
  assertEquals(isServiceRoleRequest(req({ apikey: "" }), [""]), false);
});
