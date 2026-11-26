# Campsites

Find public campgrounds near you and plan trips around them.

## Language

### Campgrounds

**Campground**:
A place to camp, from one Source, at one Location.
_Avoid_: site, campsite (a campsite is a pitch inside a Campground), facility

**Source**:
The public feed a Campground comes from (NPS, RIDB or OSM).
_Avoid_: provider, origin, agency (an agency is who manages the land)

**State-run campground**:
A Campground run by a state agency (a state park, state forest or state recreation area). They come from OSM, with the agency `STATE`.
_Avoid_: state campground (ambiguous with a Campground's State), state park (not every one is a park)

**Retired campground**:
A Campground its Source no longer lists, or that turned out to be a duplicate or not state-run. Hidden from search, kept in favorites and trips. Only OSM campgrounds are retired, and none is ever deleted.
_Avoid_: deleted, removed, inactive, closed (a retired campground may still be open; OSM just no longer lists it)

**Sync run**:
One fetch of one Source for one state, with its counts (`osm_sync_runs`).
_Avoid_: import, job (the job is the cron entry that starts runs)

**Searchable campground**:
A Campground with a known Location; ones placed at 0,0 by their Source are not searchable.
_Avoid_: valid campground, active campground

**Where filter**:
The search control that limits results to chosen States or regions.
_Avoid_: state filter (that's the RPC parameter), region picker

### A Campground's state

**State**:
The US state a Campground is in, the one the Where filter uses. Decided by, in order: a State override, then the Location state (outside the Border margin), then the Source state.
_Avoid_: stored state, effective state, final state

**Source state**:
The state the Source's address gave for a Campground, which may be missing or name a mailing office elsewhere.
_Avoid_: feed state, address state, original state

**Location state**:
The state whose boundary contains a Campground's Location.
_Avoid_: geo state, computed state, GPS state

**State override**:
A state an admin chose for a Campground by hand; it outranks everything else until an admin clears it, even if the Location later changes.
_Avoid_: lock, correction, manual state

**Border margin**:
The distance (1 km) from a Source state's edge within which the Source state is kept even when the Location state differs.
_Avoid_: tolerance, buffer

**State reason**:
Why a Campground's State has its value: from the Source, filled in or overridden by Location, kept near a border, set by an admin, or left as it was because there was no Location, no boundary or no boundary data.
_Avoid_: state status, state source

**State log**:
The record of every time a Campground's State or State reason changed, kept so wrong results can be found and fixed by hand.
_Avoid_: audit log, history
