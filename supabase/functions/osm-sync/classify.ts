// Which OSM campgrounds count as state-run (design section 6.3, step 3). OSM also has
// federal campgrounds (RIDB and NPS already cover those), county, city and private ones.
// Rules in order, first match wins:
//   1. no name                                   -> no_name
//   2. operator matches EXCLUDE                  -> not_state_run
//   3. operator:wikidata on the state allowlist  -> kept
//   4. operator matches INCLUDE                  -> kept
//   5. no operator, name matches STATE_NAME (and not EXCLUDE) -> kept
//   6. anything else                             -> not_state_run
import { STATE_AGENCY_WIKIDATA } from "./state-agencies.ts";

export type OsmTags = Record<string, string | undefined>;
export type Verdict = "kept" | "no_name" | "not_state_run";

// Federal agencies are named exactly, so state ones that share words ("Bureau of State
// Parks", "Department of Fish and Wildlife") aren't caught. Local government (county,
// city, town, township, village, district) and private operators are excluded too.
export const EXCLUDE = new RegExp(
  [
    "national",
    "usda",
    "forest service",
    "\\busfs\\b",
    "corps of engineers",
    "\\busace\\b",
    "bureau of (land management|reclamation|indian affairs)",
    "\\bblm\\b",
    "\\b(u\\.?\\s?s\\.?|united states) fish (and|&) wildlife",
    "fish (and|&) wildlife service",
    "county",
    "city of",
    "town of",
    "township",
    "village of",
    "district",
    "\\bkoa\\b",
    "private",
  ].join("|"),
  "i",
);
export const INCLUDE = new RegExp(
  [
    "state park",
    "state forest",
    "state recreation area",
    "bureau of state parks",
    "bureau of forestry",
    "department of natural resources",
    "\\bDNR\\b",
    "\\bDCNR\\b",
    "department of conservation",
    "conservation commission",
    "department of fish (and|&) (wildlife|game)",
    "fish (and|&) wildlife conservation",
    "department of forestry",
    "park service",
    "parks and recreation",
    "parks & recreation",
    "parks (and|&) wildlife",
  ].join("|"),
  "i",
);
export const STATE_NAME = /\bstate (park|forest|recreation area|beach|campground)\b/i;

export function classify(
  tags: OsmTags,
  allowlist: ReadonlySet<string> = STATE_AGENCY_WIKIDATA,
): Verdict {
  const name = tags.name?.trim();
  if (!name) return "no_name";

  const operator = tags.operator?.trim();
  if (operator && EXCLUDE.test(operator)) return "not_state_run";

  const wikidata = tags["operator:wikidata"]?.trim();
  if (wikidata && allowlist.has(wikidata)) return "kept";

  if (operator && INCLUDE.test(operator)) return "kept";

  if (!operator && STATE_NAME.test(name) && !EXCLUDE.test(name)) return "kept";

  return "not_state_run";
}
