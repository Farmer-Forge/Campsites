import { assertEquals } from "jsr:@std/assert";
import { escapeHtml, safeUrl, toOsmRow } from "./transform.ts";

Deno.test("toOsmRow: a node becomes a namespaced row with its own point", () => {
  const row = toOsmRow({
    type: "node",
    id: 42,
    lat: 47.2,
    lon: -95.2,
    tags: {
      name: "Itasca State Park Campground",
      operator: "Minnesota DNR",
      "operator:wikidata": "Q123",
      website: "https://www.dnr.state.mn.us/state_parks/itasca/",
      phone: "+1 218 555 0100",
      toilets: "yes",
      shower: "no",
      drinking_water: "yes",
      tents: "yes",
      "addr:state": "mn",
    },
  });
  assertEquals(row?.id, "osm:node/42");
  assertEquals(row?.name, "Itasca State Park Campground");
  assertEquals(row?.lat, 47.2);
  assertEquals(row?.lng, -95.2);
  assertEquals(row?.description, "Operated by Minnesota DNR.");
  assertEquals(row?.reservation_url, "https://www.dnr.state.mn.us/state_parks/itasca/");
  assertEquals(row?.contact, { phone: "+1 218 555 0100", email: "" });
  assertEquals(row?.amenities, { toilets: "yes", showers: "no", potableWater: "yes", tents: "yes" });
  assertEquals(row?.state, "MN");
  assertEquals(row?.operator, "Minnesota DNR");
  assertEquals(row?.operator_wikidata, "Q123");
});

Deno.test("toOsmRow: a way or relation uses its center", () => {
  const way = toOsmRow({ type: "way", id: 7, center: { lat: 45.1, lon: -93.1 }, tags: { name: "A" } });
  assertEquals([way?.id, way?.lat, way?.lng], ["osm:way/7", 45.1, -93.1]);
  const rel = toOsmRow({ type: "relation", id: 8, center: { lat: 44.0, lon: -92.0 }, tags: { name: "B" } });
  assertEquals(rel?.id, "osm:relation/8");
});

Deno.test("toOsmRow: no name, no point, or a 0,0 point gives no row", () => {
  assertEquals(toOsmRow({ type: "node", id: 1, lat: 45, lon: -93, tags: {} }), null);
  assertEquals(toOsmRow({ type: "way", id: 2, tags: { name: "No center" } }), null);
  assertEquals(toOsmRow({ type: "node", id: 3, lat: 0, lon: 0, tags: { name: "Null Island" } }), null);
});

Deno.test("toOsmRow: HTML in a description is stored escaped; the name is stored as is", () => {
  const row = toOsmRow({
    type: "node",
    id: 5,
    lat: 45,
    lon: -93,
    tags: { name: "Bob & Sue's Camp", description: '<img src=x onerror="alert(1)">Nice' },
  });
  assertEquals(row?.description, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Nice");
  assertEquals(row?.name, "Bob & Sue's Camp");
});

Deno.test("toOsmRow: only http(s) websites are kept", () => {
  const bad = toOsmRow({ type: "node", id: 6, lat: 45, lon: -93, tags: { name: "X", website: "javascript:alert(1)" } });
  assertEquals(bad?.reservation_url, "");
  const contact = toOsmRow({ type: "node", id: 6, lat: 45, lon: -93, tags: { name: "X", "contact:website": "http://example.org" } });
  assertEquals(contact?.reservation_url, "http://example.org/");
});

Deno.test("toOsmRow: an addr:state that isn't a 2-letter code is dropped", () => {
  const row = toOsmRow({ type: "node", id: 9, lat: 45, lon: -93, tags: { name: "X", "addr:state": "Minnesota" } });
  assertEquals(row?.state, null);
});

Deno.test("escapeHtml and safeUrl", () => {
  assertEquals(escapeHtml(`a<b>&"'`), "a&lt;b&gt;&amp;&quot;&#39;");
  assertEquals(safeUrl("  https://x.test/a  "), "https://x.test/a");
  assertEquals(safeUrl("ftp://x.test"), "");
  assertEquals(safeUrl("not a url"), "");
  assertEquals(safeUrl(undefined), "");
});
