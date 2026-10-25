import { assertEquals } from "jsr:@std/assert";
import { isServiceRoleRequest } from "./service-role.ts";

const KEY = "service-role-key";
const req = (authorization?: string) =>
  new Request("http://localhost/functions/v1/nps-sync", {
    method: "POST",
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });

Deno.test("isServiceRoleRequest accepts the service role key as a bearer token", () => {
  assertEquals(isServiceRoleRequest(req(`Bearer ${KEY}`), KEY), true);
});

Deno.test("isServiceRoleRequest refuses the anon key or any other token", () => {
  assertEquals(isServiceRoleRequest(req("Bearer anon-key"), KEY), false);
});

Deno.test("isServiceRoleRequest refuses a request with no Authorization header", () => {
  assertEquals(isServiceRoleRequest(req(), KEY), false);
});

Deno.test("isServiceRoleRequest refuses everything when the function has no service role key", () => {
  assertEquals(isServiceRoleRequest(req("Bearer undefined"), undefined), false);
  assertEquals(isServiceRoleRequest(req("Bearer "), ""), false);
});
