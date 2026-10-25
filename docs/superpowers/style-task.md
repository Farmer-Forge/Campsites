# Loop instructions: styling and UI consistency

This project is built by an unattended loop. Nothing here stops a feature from being finished. It's the rule layer that keeps the UI from drifting across many passes, because "looks right" isn't something `ng lint` or `ng build` can catch. Worker prompt rule 8 sends every UI step here.

## Before touching UI code

1. **Read `docs/superpowers/Design.md`** if you haven't this session. It lists the tokens, the shared `rt-*` classes and the shared components.
2. **Use what exists.** Look in `src/app/shared/ui/` for a component, and in `src/styles.scss` for an `rt-*` class, that already does what you need. Use it; don't write a one-off version.
3. **Use the step's own styles first.** When the step gives a component's styles verbatim (copied from V1 when `task.md` was written), use them exactly as given. They're how V1.1 matches V1's look.

## While building

- **Only `var(--rt-…)` tokens for color.** No raw hex values, `rgb()` or named colors in component styles. `styles.scss` itself is the one place tokens are defined.
- **No new shadow depth, radius or border width** outside the shape rules in `Design.md`.
- **Buttons, inputs, tags and cards use the shared classes** (`rt-btn`, `rt-input`, `rt-tag`, `rt-page-card`, …), not hand-styled elements.
- **PrimeNG is restyled globally.** Don't restyle `p-multiselect`, `p-select` or `p-autocomplete` in a component.
- **Leaflet's own look never changes** (tiles, default markers, clusters, popups).
- **If you genuinely need a new pattern,** do both of these in the same step:
  1. add it to `src/styles.scss` as an `rt-*` class (or to `src/app/shared/ui/` as a component);
  2. add it to `Design.md` with the same detail as the existing entries.

  Never improvise a pattern inline and move on.

## Self-check before ticking a UI step

- [ ] `grep -nE '#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(' <the component files you changed>` finds nothing, except inside `src/styles.scss`'s `:root`.
- [ ] Every button is an `rt-btn` / `rt-text-btn` / `rt-icon-btn`, every text input or select is an `rt-input`, and the step didn't add a hand-styled duplicate.
- [ ] No new `rt-*` class or shared component without a matching `Design.md` entry in this same step.
- [ ] `npx ng lint` and `npx ng build` are clean.
- [ ] The copy matches the spec's exact text, and the product name is "Campsite Finder".

If any box is unchecked, fix it in this step. Later passes build on inconsistency rather than fixing it.

## Done means

The screen renders, lint and build pass, it uses only shared classes, components and tokens, and it looks like it belongs next to every other screen built so far.
