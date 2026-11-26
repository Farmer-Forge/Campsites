// One state's campgrounds from the Overpass API (design section 6.3, step 2).
// Overpass's usage policy: one request at a time, a pause between them, no more than
// needed. Callers run one state per call; this retries once on a 429 or 5xx. The worst
// case (65 s + 10 s + 65 s) stays inside a 150 s edge-function wall clock.
import type { OverpassElement } from "./transform.ts";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** The endpoint: the OVERPASS_URL secret when set (to switch to a mirror), else the main server. */
export function overpassUrl(env: { get(name: string): string | undefined }): string {
  const value = env.get("OVERPASS_URL")?.trim();
  return value && value.startsWith("https://") ? value : OVERPASS_URL;
}
export const USER_AGENT = "Campsites-osm-sync/1.0";
const BACKOFF_MS = [10_000];
const REQUEST_TIMEOUT_MS = 65_000;

export function stateQuery(state: string): string {
  if (!/^[A-Z]{2}$/.test(state)) throw new Error(`bad state code: ${state}`);
  return [
    "[out:json][timeout:60];",
    `area["ISO3166-2"="US-${state}"][admin_level=4]->.s;`,
    'nwr["tourism"="camp_site"](area.s);',
    "out center tags;",
  ].join("\n");
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchState(
  state: string,
  fetchFn: Fetch = fetch,
  sleep: Sleep = realSleep,
  url: string = OVERPASS_URL,
): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: stateQuery(state) });
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // A timeout or a dropped connection is retried like a 5xx.
      if (attempt >= BACKOFF_MS.length) {
        throw new Error(`Overpass unreachable for ${state}: ${(err as Error).message}`);
      }
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }
    if (response.ok) {
      const json = await response.json();
      // Overpass reports a query that ran out of time or memory in `remark`, with a
      // partial result: treat it as a failure, never as a smaller state.
      if (typeof json?.remark === "string" && /runtime error|timed out|out of memory/i.test(json.remark)) {
        throw new Error(`Overpass incomplete for ${state}: ${json.remark}`);
      }
      if (!Array.isArray(json?.elements)) throw new Error(`Overpass sent no elements for ${state}`);
      return json.elements as OverpassElement[];
    }
    await response.body?.cancel();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= BACKOFF_MS.length) {
      throw new Error(`Overpass ${response.status} for ${state}`);
    }
    await sleep(BACKOFF_MS[attempt]);
  }
}
