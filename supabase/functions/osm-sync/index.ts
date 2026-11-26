// osm-sync: state-run campgrounds from OpenStreetMap, one state per call (Shawn,
// 2026-11-26; design ~/plans/2026-11-26-campsites-state-parks-osm-design.md on Lisa).
// Called every 15 minutes by pg_cron (0026) with no state; `?state=MN` forces one state
// (dry runs and QC). The database decides which state is due, dedupes against NPS/RIDB,
// upserts, retires and logs (apply_osm_sync_state, 0025). NPS and RIDB rows are never
// touched. Only callers with a secret key may run it (_shared/service-role.ts).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { adminKeyFromEnv, isServiceRoleRequest, secretKeysFromEnv } from "../_shared/service-role.ts";
import { classify } from "./classify.ts";
import { fetchState, overpassUrl } from "./overpass.ts";
import { osmId, OsmRow, toOsmRow } from "./transform.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = adminKeyFromEnv(Deno.env);

  if (!isServiceRoleRequest(req, secretKeysFromEnv(Deno.env))) {
    return new Response("Forbidden: run this sync with a secret key", { status: 403 });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing required environment variables", { status: 500 });
  }

  const forced = new URL(req.url).searchParams.get("state");
  if (forced !== null && !/^[A-Z]{2}$/.test(forced)) {
    return new Response("state must be a two-letter code", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: started, error: startError } = await supabase.rpc("start_osm_sync_run", { p_state: forced });
  if (startError) return new Response(`Could not start a run: ${startError.message}`, { status: 500 });
  const run = (started ?? [])[0] as { run_id: number; state: string } | undefined;
  if (!run) return json({ idle: true });

  try {
    const elements = await fetchState(run.state, fetch, undefined, overpassUrl(Deno.env));

    const rows: OsmRow[] = [];
    const droppedIds: string[] = [];
    const unplacedIds: string[] = [];
    let droppedNoName = 0;
    // A Map, not an object: operator text is crowd-edited ("__proto__" and the like).
    const operators = new Map<string, { kept: number; dropped: number }>();

    for (const el of elements) {
      const tags = el.tags ?? {};
      const verdict = classify(tags);
      const operatorKey = tags.operator?.trim() || "(none)";
      const counts = operators.get(operatorKey) ?? { kept: 0, dropped: 0 };
      operators.set(operatorKey, counts);

      if (verdict === "no_name") {
        droppedNoName++;
        counts.dropped++;
      } else if (verdict === "not_state_run") {
        // An existing row for it is retired as not state-run.
        droppedIds.push(osmId(el));
        counts.dropped++;
      } else {
        const row = toOsmRow(el);
        if (row) {
          rows.push(row);
          counts.kept++;
        } else {
          // Kept, but with no usable point: left exactly as it is, and counted.
          unplacedIds.push(osmId(el));
          counts.dropped++;
        }
      }
    }

    const { data: result, error } = await supabase.rpc("apply_osm_sync_state", {
      p_run_id: run.run_id,
      p_rows: rows,
      p_dropped_ids: droppedIds,
      p_unplaced_ids: unplacedIds,
      p_fetched: elements.length,
      p_dropped_no_name: droppedNoName,
      p_operators: Object.fromEntries(operators),
    });
    if (error) throw new Error(error.message);
    console.log("osm-sync", result);
    return json(result);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await supabase.rpc("fail_osm_sync_run", { p_run_id: run.run_id, p_error: message });
    console.error(`osm-sync ${run.state} failed, existing data retained:`, message);
    return new Response(`Sync failed for ${run.state}: ${message}`, { status: 502 });
  }
});
