// Wikidata ids (operator:wikidata) of the 50 states' park and forest agencies. An OSM
// campground whose operator:wikidata is listed here counts as state-run even when its
// operator text matches nothing in INCLUDE, but EXCLUDE (federal, local, private)
// still wins (classify.ts, rules 2 and 3; design section 6.3, step 3).
//
// Filled in from the 2026-11-26 dry run (Shawn's OK, 2026-11-27): each id was seen on
// kept campgrounds together with the agency named here, never guessed. Format: "Q12345".
export const STATE_AGENCY_WIKIDATA: ReadonlySet<string> = new Set<string>([
  "Q6837532", // Michigan Department of Natural Resources
  "Q109319503", // Arkansas State Parks
  "Q6868223", // Minnesota Department of Natural Resources
  "Q5461615", // Florida State Parks
  "Q7971840", // Washington State Department of Natural Resources
  "Q7972267", // Washington State Parks and Recreation Commission
  "Q2933976", // California Department of Parks and Recreation
  "Q16846582", // Illinois Department of Natural Resources
  "Q7101287", // Oregon Parks and Recreation Department
  "Q7934237", // Virginia Department of Conservation and Recreation
  "Q5603758", // West Virginia State Parks
  "Q6064364", // Iowa Department of Natural Resources
  "Q109328529", // North Carolina Division of Parks and Recreation
  "Q109319569", // Missouri State Parks
  "Q5148857", // Colorado Parks & Wildlife
  "Q72926688", // Georgia State Parks & Historic Sites
  "Q2543589", // Massachusetts Department of Conservation and Recreation
  "Q5253364", // Delaware State Parks
  "Q130236073", // Pennsylvania Bureau of State Parks
]);
