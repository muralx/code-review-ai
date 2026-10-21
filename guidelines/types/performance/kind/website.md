### Website specifics for performance

A website's cost is paid by every user on every load, on hardware and networks the team does not
choose. The budget is the bytes the entry downloads and the main-thread time before the page is
usable; the general checklist owns measurement discipline and hot-path cost inside the code.

### Always check (website)

1. The entry chunk grows: a dependency imported statically from the entry or anything it imports
   (a barrel counts), a heavy library (charting, rich editor, full locale data, an icon set) in
   the initial graph, a dependency the tree bans, or a CI budget raised so the change passes.
   **Major** when the configured budget fails, or none exists and the addition is tens of kilobytes
   gzipped; **Minor** below. Build; compare entry plus preloaded chunks gzipped before and after.
2. A route or heavy widget is imported eagerly where siblings are lazy, or a lazy import is
   re-exported through a barrel the entry imports, defeating the split. **Major**: the whole app
   ships on first load. Read the route table for dynamic imports; build and compare chunk graphs.
3. Layout shift: images without intrinsic dimensions or a reserved aspect ratio, late-injected
   banners with no reserved space, fonts with no `font-display` strategy so text reflows.
   **Major** on a route's main layout; **Minor** otherwise. Grep `<img` for `width`, `height` and
   `loading`; read the font-face and preload declarations; run the lab audit and read CLS.
4. Largest paint delayed: the hero image lazy-loaded or not preloaded, a blocking third-party
   script or stylesheet in the head, a critical-path font from an origin with no preconnect.
   **Major** when the lab audit's LCP crosses the tree's target (2.5 s where none is set). Read
   the head template; run the audit and cite the LCP element.
5. Main-thread blocking: synchronous heavy work (parsing, sorting or diffing large lists, hashing,
   image processing) in a render path or event handler where the tree has a worker adapter for
   it. **Major** when the work scales with data size. Take the input's size from the contract or
   page size; time the call with `performance.now()` or a profile; cite the number.
6. Re-render storms on an interaction path: a context value, object, array or callback rebuilt
   every render feeding a memoised subtree, a store subscription with no selector, state lifted to
   a root that re-renders the tree per keystroke. **Major** when lab or field INP crosses the
   target (200 ms where none is set); **Minor** otherwise. Profile render counts; check selectors.
7. Memoisation added with no measured cause (cheap values with primitive inputs), or a dependency
   list that omits an input so the memo goes stale. **Minor** for noise; **Major** for the stale
   value. Ask for the profile in the change; run the configured hook-dependency lint.
8. A user-sized list renders every row with no virtualisation or pagination. **Major** when the
   contract or page size allows hundreds of items. Find the bound on the data source.
9. The tree reports real-user web vitals and the new route or interaction is excluded, or
   reporting is added that sends a beacon per interaction with no sampling or batching. **Minor**.
   Read the vitals setup and its route coverage; count beacons in a short session.

### False positives (website)

- A heavy dependency in a lazily loaded route chunk is the intended placement; the budget is the
  entry graph.
- Development-only code (devtools, mock service) absent from the production output; confirm by
  grepping the built assets, then drop.
- Memoisation applied uniformly by the tree's convention; the finding is a wrong dependency list,
  not the convention. A list bounded by the API's page size needs no virtualisation.
- A self-hosted, preloaded font with a swap strategy adds a request and is still correct.
