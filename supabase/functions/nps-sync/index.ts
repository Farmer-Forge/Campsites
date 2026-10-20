import { createClient } from "jsr:@supabase/supabase-js@2";
import { toCampgroundRow, toParkRow } from "./transform.ts";

const NPS_API_BASE = "https://developer.nps.gov/api/v1";

Deno.serve(async (_req) => {
  const npsApiKey = Deno.env.get("NPS_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!npsApiKey || !supabaseUrl || !serviceRoleKey) {
    return new Response("Missing required environment variables", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let start = 0;
  const limit = 50;
  let total = Infinity;
  let upserted = 0;
  let skipped = 0;
  const parkCodes = new Set<string>();

  try {
    while (start < total) {
      const url = `${NPS_API_BASE}/campgrounds?start=${start}&limit=${limit}&api_key=${npsApiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NPS API request failed: ${response.status}`);
      }
      const body = await response.json();
      total = parseInt(body.total, 10);

      const rows = body.data
        .map(toCampgroundRow)
        .filter((row: unknown) => row !== null);
      skipped += body.data.length - rows.length;

      for (const row of rows) parkCodes.add(row.park_code);

      if (rows.length > 0) {
        const { error } = await supabase.from("campgrounds").upsert(rows);
        if (error) throw error;
        upserted += rows.length;
      }

      start += limit;
    }

    // Names only for the parks our campgrounds actually reference, not all
    // ~470 NPS units.
    const codes = [...parkCodes];
    let parks = 0;
    for (let i = 0; i < codes.length; i += limit) {
      const batch = codes.slice(i, i + limit).join(",");
      const url = `${NPS_API_BASE}/parks?parkCode=${batch}&limit=${limit}&api_key=${npsApiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`NPS API parks request failed: ${response.status}`);
      }
      const body = await response.json();
      const rows = body.data
        .map(toParkRow)
        .filter((row: unknown) => row !== null);
      if (rows.length > 0) {
        const { error } = await supabase.from("parks").upsert(rows);
        if (error) throw error;
        parks += rows.length;
      }
    }

    return new Response(
      JSON.stringify({ upserted, skipped, parks }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("nps-sync failed, existing data retained:", err);
    return new Response(`Sync failed: ${(err as Error).message}`, { status: 500 });
  }
});
