// An Overpass element -> the row apply_osm_sync_state() takes (design section 6.1).
// OSM is crowd-edited. The detail panel renders `description` with innerHTML, so the
// description is stored HTML-escaped; names go to the page through Angular
// interpolation and Leaflet's textContent, which escape them, so they're stored as is.
// Only http(s) links are kept.
import type { OsmTags } from "./classify.ts";

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
}

export interface OsmRow {
  id: string;
  name: string;
  description: string;
  lng: number;
  lat: number;
  reservation_url: string;
  contact: { phone: string; email: string };
  amenities: Record<string, string>;
  state: string | null;
  operator: string | null;
  operator_wikidata: string | null;
}

export function osmId(el: Pick<OverpassElement, "type" | "id">): string {
  return `osm:${el.type}/${el.id}`;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// OSM tag -> the NPS amenity key that means the same, where there is one.
const AMENITY_KEYS: Record<string, string> = {
  toilets: "toilets",
  shower: "showers",
  drinking_water: "potableWater",
  tents: "tents",
  caravans: "caravans",
  reservation: "reservation",
  fee: "fee",
};

function point(el: OverpassElement): { lat: number; lng: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** The row for a kept element, or null when it has no name or no usable point. */
export function toOsmRow(el: OverpassElement): OsmRow | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  const at = point(el);
  if (!at) return null;

  const operator = tags.operator?.trim() || null;
  const description = tags.description?.trim()
    ? tags.description.trim()
    : operator
    ? `Operated by ${operator}.`
    : "";

  const amenities: Record<string, string> = {};
  for (const [tag, key] of Object.entries(AMENITY_KEYS)) {
    const value = tags[tag]?.trim();
    if (value) amenities[key] = value;
  }

  const state = tags["addr:state"]?.trim().toUpperCase();

  return {
    id: osmId(el),
    name,
    description: escapeHtml(description),
    lng: at.lng,
    lat: at.lat,
    reservation_url: safeUrl(tags.website ?? tags["contact:website"]),
    contact: {
      phone: tags.phone ?? tags["contact:phone"] ?? "",
      email: tags.email ?? tags["contact:email"] ?? "",
    },
    amenities,
    state: state && /^[A-Z]{2}$/.test(state) ? state : null,
    operator,
    operator_wikidata: tags["operator:wikidata"]?.trim() || null,
  };
}
