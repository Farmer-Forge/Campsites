// Wikidata ids (operator:wikidata) of the 50 states' park and forest agencies. An OSM
// campground whose operator:wikidata is listed here counts as state-run even when its
// operator text matches nothing in INCLUDE, but EXCLUDE (federal, local, private)
// still wins (classify.ts, rules 2 and 3; design section 6.3, step 3).
//
// Deliberately empty at first: the ids are filled in from the dry run's logged
// operator:wikidata values, with Shawn's OK, never guessed. Format: "Q12345".
export const STATE_AGENCY_WIKIDATA: ReadonlySet<string> = new Set<string>([]);
