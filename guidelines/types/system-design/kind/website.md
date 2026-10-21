### Website specifics for system-design

A website ships two deployables that must agree: a browser bundle a user may keep open for
days, and a backend that changes under it, with caches and a CDN between them.

### Always check (website)

1. A cacheable response changes with no cache key change: an asset edited in place under the
   same path, caching headers that outlive new fields, personalised content behind a shared CDN
   rule. **Major**; **Critical** when one user's data can reach another. Read the cache headers.
2. Session state lives where it does not survive a deploy or replica switch: process memory with
   no sticky routing, a cookie with no server record where revocation is needed, browser storage
   the server cannot invalidate. **Major**. State what a logged-in user sees after a restart.
3. Server and client render disagree: browser-only state (time zone, viewport, storage) read
   during server render, hydration warnings suppressed wholesale, a fetch run on both sides.
   **Major** for wrong visible content or a hydration error; **Minor** otherwise. Run the server
   build; read the console.
4. The bundle calls an endpoint the backend changes in the same deploy with no compatibility
   window: a removed field the old bundle reads, a renamed route, a stricter schema. **Major**;
   **Critical** when the old bundle is cached longer than the deploy. Pair each API change with
   every bundle call site.
5. Build artefacts are not reproducible or immutable: a build depending on the clock or unpinned
   remote resources, an environment value compiled into a shared bundle, a source map published
   by accident. **Minor**; **Major** when one bundle must serve two environments.
6. A feature flag is evaluated differently on server and browser, defaults to on when the flag
   service is unreachable, or has no removal path. **Major** when the sides can disagree for one
   user; **Minor** for a stale flag. Also **Minor**, **Major** over a stated budget: new weight
   on the critical rendering path (main-bundle dependency, blocking script, font or image).

### False positives (website)

- Hashed assets with a long `max-age` behind a short-lived HTML document is the standard pattern.
- A hydration mismatch the framework documents as benign and the code marks explicitly (a
  suppressed warning on a timestamp) is a choice, not a defect.
- Additive API changes (new optional fields, new routes) need no compatibility window.
