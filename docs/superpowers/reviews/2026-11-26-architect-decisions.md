# Campsites Task 13: architect decisions (2026-11-26)

Task 13 shows state-run and retired campgrounds (spec 3, change #14). The database side (`0025`–`0026`, `osm-sync`) is on `main` from PR #56, hand-written by Lisa.

## Must answer before doloop.sh

- [ ] D1: **Ralph's Campsites stack has to be reset and reseeded before Task 13 starts.** It's still at `0024`, without `seed-osm.sql` (now 4 sample State campgrounds, with a retired favorite and a retired trip stop for Pat). Step 1's red check runs before the loop's first gate, so on today's stack it would stop with `ERROR … sample OSM campgrounds` (a `BLOCKED:`). Options: **Lisa runs `supabase db reset` + `./ralphloop/seed-dev.sh` in `~/projects/Campsites` on Ralph, then `doloop.sh`** (in tmux `campsites-chain`) | Shawn does both. The draft assumes Lisa does them, on Shawn's OK. The reset wipes only local dev data, which the gate resets on every step anyway. (task.md: Task 13 Step 1.) If wrong: Step 1 writes `BLOCKED:` and nothing is built.

## Default stands unless you object

D2: **When Task 13 may merge.** Draft: any time after QC. Before `0025` is in production, `get_campgrounds_by_ids` has no `retired` column, so every card is "live" and the STATE chip simply has no campgrounds yet, which is harmless. Other: hold the merge until the dry run is approved and the data is in production. (Rollout §8 in the design.)

D3: **The chip's text is `STATE`**, all caps like `NPS` and `USFS`, last in the row. Other: "State". (task.md: Task 13 Step 2; spec 3 change #14.)

D4: **A retired card keeps its +, disabled and greyed** (`rt-icon-btn:disabled`, opacity 0.45), titled "No longer listed: can't be added to a trip". Other: hide the +. (task.md: Step 3.)

D5: **The retired tag reads "No longer listed"** (`rt-tag rt-tag--outline`, after the park code). Other: "Retired", or a cherry tag. (task.md: Step 3; spec 3 change #14.)

D6: **Restored tabs from before this change get STATE turned on** (`agenciesVersion: 2`). Other: leave old snapshots as they are, so STATE stays off in those tabs until Reset filters. (task.md: Step 2.)

D7: **The About credit** reads "State campground data © OpenStreetMap contributors, available under the Open Database License.", in its own `section.contact.credits` under the contact line. Other: in the footer, or at the bottom of the Finder. (task.md: Step 4; admin-about spec.)

D8: **The dev seed's sample State campgrounds moved 110–140 miles north of Minneapolis** (`seed-osm.sql`, in this PR). Near Minneapolis they became the 4th-nearest card and failed `scroll-check.mjs` case 5. Other: change the scroll check. (Self-Review Notes.)

D9: **A long-card scroll behaviour found while checking is logged, not fixed** (`docs/next-loop-bugs.md` item 9): with the samples near Minneapolis, clicking the 4th card (Highland Ridge, USACE, a tall detail panel) moved the list 290 px with the card not fully in view. Other: fix it in Task 13. (Out of scope here: it's the list-scroll behaviour of spec 3 change #12, not state campgrounds.)

D10: **A State campground's panel link reads "Visit website"** (plan adversary F3). Its `reservation_url` is the OSM `website`, so V1's "Reserve on recreation.gov" would be wrong for it; federal campgrounds keep their label. The draft has this fix in it (task.md: Step 3; spec 3 change #14; state-check case 3). Others: keep "Reserve on recreation.gov" for everyone, or one neutral label ("Reserve or visit") for all.
