# Location decides a Campground's state, outside a 1 km Border margin

Sources often give no address (163 NPS and 294 RIDB records had none) or a mailing office in another state, so a Campground's State comes from the boundary its Location falls in, overriding the Source state when the point is more than 1 km outside that state; inside the margin the Source state is kept, because 1:500k boundaries are only accurate to a few hundred metres. Every change is written to the State log and an admin can set a State override (Shawn, 2026-11-15).

## Considered options

- Fill missing states only, never override the Source: smallest, but keeps wrong mailing-office states.
- Location always wins: border-precision misses would overwrite correct Source states.
