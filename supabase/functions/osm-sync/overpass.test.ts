import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import { fetchState, OVERPASS_URL, overpassUrl, stateQuery } from "./overpass.ts";

const noSleep = () => Promise.resolve();
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response("busy", { status: code });

Deno.test("stateQuery asks for one state's camp sites with centers", () => {
  const q = stateQuery("MN");
  assertStringIncludes(q, 'area["ISO3166-2"="US-MN"][admin_level=4]');
  assertStringIncludes(q, 'nwr["tourism"="camp_site"](area.s);');
  assertStringIncludes(q, "out center tags;");
  assertThrows(() => stateQuery('MN"];node(1);//'));
});

Deno.test("fetchState returns the elements", async () => {
  const els = await fetchState("MN", () => Promise.resolve(ok({ elements: [{ type: "node", id: 1 }] })), noSleep);
  assertEquals(els.length, 1);
});

Deno.test("fetchState retries once on a 502 or 429, then gives up", async () => {
  let calls = 0;
  const flaky = () => Promise.resolve(++calls === 1 ? status(502) : ok({ elements: [] }));
  assertEquals((await fetchState("MN", flaky, noSleep)).length, 0);
  assertEquals(calls, 2);

  calls = 0;
  const busy = () => Promise.resolve((++calls, status(429)));
  await assertRejects(() => fetchState("MN", busy, noSleep), Error, "Overpass 429");
  assertEquals(calls, 2);
});

Deno.test("fetchState retries a timeout once, then reports it", async () => {
  let calls = 0;
  const slow = () => {
    calls++;
    return Promise.reject(new DOMException("Signal timed out.", "TimeoutError"));
  };
  await assertRejects(() => fetchState("MN", slow, noSleep), Error, "unreachable");
  assertEquals(calls, 2);
});

Deno.test("fetchState doesn't retry a 400", async () => {
  let calls = 0;
  await assertRejects(() => fetchState("MN", () => Promise.resolve((++calls, status(400))), noSleep), Error, "Overpass 400");
  assertEquals(calls, 1);
});

Deno.test("fetchState treats a timed-out partial result as a failure", async () => {
  const partial = () =>
    Promise.resolve(ok({ remark: "runtime error: Query timed out in \"query\" at line 3", elements: [{ type: "node", id: 1 }] }));
  await assertRejects(() => fetchState("MN", partial, noSleep), Error, "incomplete");
});

Deno.test("fetchState refuses a body with no elements", async () => {
  await assertRejects(() => fetchState("MN", () => Promise.resolve(ok({})), noSleep), Error, "no elements");
});

Deno.test("overpassUrl: the OVERPASS_URL secret switches to a mirror, https only", () => {
  const env = (v?: string) => ({ get: () => v });
  assertEquals(overpassUrl(env()), OVERPASS_URL);
  assertEquals(overpassUrl(env("https://mirror.test/api/interpreter")), "https://mirror.test/api/interpreter");
  assertEquals(overpassUrl(env("http://mirror.test/api/interpreter")), OVERPASS_URL);
});

Deno.test("fetchState posts to the url it is given", async () => {
  let seen = "";
  await fetchState("MN", (u) => { seen = u; return Promise.resolve(ok({ elements: [] })); }, noSleep, "https://mirror.test/x");
  assertEquals(seen, "https://mirror.test/x");
});
