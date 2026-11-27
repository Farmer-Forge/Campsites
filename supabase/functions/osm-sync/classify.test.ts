import { assertEquals } from "jsr:@std/assert";
import { classify } from "./classify.ts";

Deno.test("classify: no name is dropped first, whatever the operator", () => {
  assertEquals(classify({ operator: "Minnesota DNR" }), "no_name");
  assertEquals(classify({ name: "   ", operator: "Minnesota DNR" }), "no_name");
});

Deno.test("classify: state agencies by operator text are kept", () => {
  for (
    const operator of [
      "Minnesota Department of Natural Resources",
      "Wisconsin DNR",
      "Michigan State Parks",
      "Texas Parks & Wildlife Department",
      "Missouri Department of Conservation",
      "Iowa State Forest",
      "Pennsylvania DCNR Bureau of State Parks",
      "Bureau of Forestry",
      "Oregon Department of Fish and Wildlife",
      "Florida Fish and Wildlife Conservation Commission",
      "Minnesota Parks and Recreation",
      "Delaware Forest Service",
      "Texas A&M Forest Service",
    ]
  ) {
    assertEquals(classify({ name: "Some Campground", operator }), "kept", operator);
  }
});

Deno.test("classify: federal, county, city and private operators are dropped", () => {
  for (
    const operator of [
      "National Park Service",
      "USDA Forest Service",
      "U.S. Forest Service",
      "United States Forest Service",
      "Forest Service",
      "U.S. Department of Agriculture Forest Service",
      "USDA - Forest Service",
      "Forest Service, Region 9",
      "Forest Service (USFS)",
      "Superior National Forest",
      "US Army Corps of Engineers",
      "Bureau of Land Management",
      "US Fish and Wildlife Service",
      "U.S. Fish & Wildlife Service",
      "Bureau of Reclamation",
      "Town of Ely Parks and Recreation",
      "Lake Soil and Water Conservation District",
      "Village of Ely Parks & Recreation",
      "Hennepin County Parks and Recreation",
      "City of Duluth Parks and Recreation",
      "KOA",
      "Private",
    ]
  ) {
    assertEquals(classify({ name: "Some Campground", operator }), "not_state_run", operator);
  }
});

Deno.test("classify: an operator:wikidata on the allowlist is kept even with odd operator text", () => {
  const allow = new Set(["Q999"]);
  assertEquals(classify({ name: "Lake Camp", operator: "MN Parks", "operator:wikidata": "Q999" }, allow), "kept");
  assertEquals(classify({ name: "Lake Camp", operator: "MN Parks", "operator:wikidata": "Q1" }, allow), "not_state_run");
});

Deno.test("classify: the exclude list wins over the allowlist", () => {
  const allow = new Set(["Q999"]);
  assertEquals(classify({ name: "Lake Camp", operator: "Anoka County", "operator:wikidata": "Q999" }, allow), "not_state_run");
});

Deno.test("classify: no operator, a state-park name is kept; other names are dropped", () => {
  assertEquals(classify({ name: "Itasca State Park Campground" }), "kept");
  assertEquals(classify({ name: "Savanna Portage State Forest Campground" }), "kept");
  assertEquals(classify({ name: "Lake Bemidji State Recreation Area" }), "kept");
  assertEquals(classify({ name: "Pine Lake Campground" }), "not_state_run");
  assertEquals(classify({ name: "State Park Road KOA" }), "not_state_run");
});

Deno.test("classify: an unmatched operator is dropped", () => {
  assertEquals(classify({ name: "Bob's Camp", operator: "Bob Smith" }), "not_state_run");
});
