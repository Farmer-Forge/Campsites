# Campsites Task 11 (Forge Outdoors · Campsites header): architect decisions (2026-11-16)

Spec: spec 2, **Change #6** (from Lisa's approved design `2026-11-15-campsites-header-rebrand-design.md`, Shawn 2026-11-15). Plan: `ralphloop/task.md` Task 11. Check: `ralphloop/header-check.mjs`.

## Must answer before chain.sh

- [x] D1 (Shawn: yes; done 2026-11-17: `main` FAIL 1–6, Task 11 7 of 7, console check passed, on a throwaway `t11` stack with the dev seed; see task.md Self-Review Notes): The real-stack run. Ralph was busy with the ForgeDB loop, so `header-check.mjs` was tested on Lisa against a mock Supabase, not the local stack and dev seed. Options: Lisa starts a throwaway stack on Ralph (553xx ports, torn down after) once the ForgeDB loop finishes, and runs `header-check.mjs` + `app-check.sh` on `main` (expect FAIL 1–6) and on Task 11's code (expect 7 of 7) | skip it and let the loop's red check in Step 1 be the first real run. Draft assumes the first (task.md: Self-Review Notes, "Not yet run"). If skipped: a difference between the mock and the real seed (for example the admin's profile loading late) shows up as a BLOCKED Step 1 in chain mode instead of here.

## Default stands unless you object

D2: Header spacing. The approved design used the hand-off's sizes (44px wordmark, 16px pill padding, 2px letter-spacing). At 1280px signed in as the admin that wraps to two rows (140px against 76px today). Draft: wordmark 40px (today's size), pill padding 12px, letter-spacing 1px, 6px link gaps, 12px header gaps, so it's one row at 88px (task.md: Step 2's `app.scss`; case 7 enforces it). Other: the hand-off's sizes, accepting the wrap.

D3: Phone header height. 44px tap targets make the header 222px tall at 390px (196px today), 253px at 360px and 297px at 320px (adversary F3). Draft: keep 44px everywhere (task.md: Step 2; case 5). Other: 40px pills under 640px (saves about 12px; below the 44px tap guideline).

D4: User pills (Account, Admin, Sign in) take the same style as the main links, uppercase 13px / 800. Today they're title case. Draft: same style (task.md: Step 2's `.nav-link, .nav-pill`). Other: keep their title case.

D5: Tab-title words: "About Us", "Sign in", "Sign up", "Forgot password", "Reset password", "Page not found", "Admin", "Account", "Favorites", "Trips", and "Trip" for a trip (not its name, which would need an async lookup). The Finder has no prefix. (task.md: Step 3's `app.routes.ts`.) Other: different words, or the trip's name.

D6: Archivo loads as a variable font, `wght@400..800`, instead of the brand pack's 500/700/800, because the app uses 400 (5×), 600 (13×) and 700 (19×) (task.md: Step 1). Other: load only 500/700/800 and let the browser round to the nearest weight.

D7: The badge (`public/forge-outdoors-badge.svg`, the brand pack's file unchanged) and `header-check.mjs` come with this plan PR, not from the worker. Step 4 pins the badge's hash.

D8: The rule and spec edits come with this plan PR: spec 2 **Change #6** (replaces change #5), `style-task.md`'s product-name line, `Design.md` (tokens, copy, a Nav bar entry), and an "out of date" note at the top of `docs/design/Campsite01/README.md`. Without them, a worker following `style-task.md` would put "Campsite Finder" back.

D9: Body links (cherry on paper) are 4.1:1 with the brand red (4.3:1 before), under 4.5:1. Draft: left for a separate brand decision shared with GearForge (task.md: Out of Scope). Other: fix it in this task (darker link color or underline), which changes the brand pack.

D10: The favicon stays the Farmer-Forge F (Shawn, 2026-11-15; spec 2 **Decided**). No footer and no mobile menu (Shawn).

## Answered by Shawn (2026-11-16, after plan-adversary r1)

D11 (F1): The brand pack's red `#c8402a` put cream on the primary buttons at 4.17:1 and red links on paper at 4.1:1. **Answer: `--rt-cherry` `#b8381f`** (4.86:1 and 4.8:1). Desktop updates the brand pack to match, so GearForge uses the same red. task.md: Step 1's `:root`; cases 4 (the `/login` primary button) and 6.

D12 (F2): The header wrapped between about 1005px and 1212px. **Answer: hide the CAMPSITES label above 640px and below 1240px.** One row holds down to 829px signed out, 967px as Pat and 1052px as the admin (today: 775px signed out, 1049px as the admin). task.md: Step 2's `app.scss`; case 7 at 1024px signed out and 1100px as the admin.
