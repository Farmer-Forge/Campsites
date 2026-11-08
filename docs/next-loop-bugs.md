# Bugs for the next loop

Found while QC'ing the loop's build. Each one gets folded into its spec's "Changes from V1" section (with Shawn's approval) and then into `task.md` before the loop runs.

## 1. Map zooms out and loses the campground you picked (Shawn, 2026-10-31)

**What happens:** zoom in close, click a campground marker: fine, its bubble opens. Click anything in the bubble ("View details ▸", "Add to trip…") and the map zooms out a little and the campground is lost. It's worst when the campground sits right next to another one.

**Why (diagnosis, not yet tested):** the map always jumps to a fixed zoom of 12, even when you're zoomed in closer than that:
- the marker click: `map.setView(marker.getLatLng(), 12)` ([campground-map.component.ts:123](../src/app/shared/ui/campground-map/campground-map.component.ts#L123));
- selecting a campground (which "View details" and "Add to trip…" both do): `setView([lat, lng], 12)` ([campground-map.component.ts:66](../src/app/shared/ui/campground-map/campground-map.component.ts#L66)).

At zoom 12 the marker cluster group merges nearby markers again, so a campground next to another one disappears into a cluster and its bubble closes. V1 does the same (`setView(..., 12)` in V1's `campground-map.component`), so this is a change from V1, not a rebuild mistake.

**Fix to spec:** centering on a campground never zooms out: it uses zoom 12 or the current zoom, whichever is closer in, and the campground's marker stays visible and out of a cluster (for example `cluster.zoomToShowLayer`). Applies to the Finder, Favorites and Trip maps, since they share this component.

**Spec:** 3 (Finder, `2026-10-25-finder-design.md`), "Changes from V1".

**Approved (Shawn, 2026-11-08).** Folded into spec 3 as change #10, and into `task.md` and its template (Task 5, the shared map). The code changes when the loop next runs.

## 2. Reset filters button on the Finder (Shawn, 2026-10-31)

**What's missing:** there's no way to undo all the filter changes at once. You have to put back every agency chip, the Where picker, the Park picker and the miles control one by one.

**This is new, not a fix.** V1 has no reset either. **Deferred (Shawn, 2026-11-05):** it waits until Shawn is happy with the loop's build. Only then does it go into spec 3 and `task.md`.

**Fix to spec (approved, Shawn, 2026-11-05):** a "Reset filters" button in the filter bar. It puts every filter back to its starting value in one go and reruns the search once:
- AGENCY: all five chips on;
- Where: all regions and states selected;
- Park: all parks selected;
- MILES FROM ME: All, with the remembered radius back to 50.

It keeps the current search location: resetting doesn't ask for your location again or move you back to it. It's disabled, not hidden, when the filters are already at their starting values. It sits at the end of the filter row. The saved Finder state (`sessionStorage`) is updated just as for any other filter change.

**Spec:** 3 (Finder, `2026-10-25-finder-design.md`), "Filter bar" and "Changes from V1".
