### Website specifics for documentation

A website's documents are read by whoever builds, deploys and operates it and by whoever audits
what the browser receives. Every public build variable and every mock or demo mode is a claim
about what ships to users.

### Always check (website)

1. A build-time variable under the bundler's public prefix is added or changed without a doc entry
   stating that it ships in the bundle, its purpose, default and which environments set it; or the
   example env file is not updated. **Major** when the omission lets an operator put a secret
   there; **Minor** otherwise. Grep the diff for the prefix; compare with the env example and the
   config document; the validated config module lists the real set.
2. The mock or demo mode (request interception, fake gateway, seeded data) is undocumented, or
   documented without saying it is development-only and how the production build excludes it; or
   the document says it is excluded and the build does not. **Major** when document and build
   disagree. Read the section; read the entry's gating condition and any CI leak check; build and
   grep the output when the toolchain is present.
3. Build and deploy documents disagree with the scripts: a command named in the README absent from
   the package scripts, a runtime version differing between README, version file, engines and CI,
   hosting requirements (history-fallback rewrite, headers) stated nowhere. **Major** when the
   first-run path fails; **Minor** otherwise. Run each documented command; diff the versions.
4. A public URL path is added, renamed or removed and user-facing documents, the sitemap or a
   redirect table still name the old one. **Minor**; **Major** for a published URL with no
   redirect. Grep the documents for the old path.
5. An accessibility statement or conformance claim names a level the configured scan does not
   test, or the change adds a surface the gate does not cover while the claim stands. **Minor**;
   **Major** when the claim is public and false. Compare the statement's level with the scan
   tags; list new surfaces against scan coverage.
6. Browser or platform support claims disagree with the build target (browserslist, compile
   target, polyfill set). **Minor**; **Major** when a documented browser cannot load the bundle.
   Read the target configuration against the stated support.
7. A new shared component has no story or usage document where the tree keeps them, or the
   existing one shows props the component no longer accepts. **Minor**. Find the stories
   convention; compare the story's arguments with the component's props type.

### False positives (website)

- Variables the framework exposes to the browser by design (API base URL, build id) need a
  one-line entry, not a security note each.
- Mock-mode documentation in a contributor guide the README points at is documented.
- Hosting configuration kept in an operations repository: the finding is a README that claims
  otherwise, not the absence.
- An accessibility statement on an authenticated internal tool is optional; the finding is a false
  claim, not a missing one.
