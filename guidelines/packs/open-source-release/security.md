### Open-source-release specifics for security

Publication makes the history public as well as the head: a credential committed and removed
is still leaked, an internal hostname in a fixture is a map of the private network, and a
build script that ships runs on a stranger's machine.

### Always check (open-source-release)

1. A credential, token, private key or internal URL exists anywhere in the history of a file
   on the export path, not only at the head. **Critical** for material that may still be
   valid; **Major** for internal hostnames and URLs. Run the tree's secret scanner over the
   range, or `git log -p -S<pattern>` on the export path; a head-only grep proves nothing when
   history is exported. Describe location and kind; never quote the value.
2. Environment files, CI workflows, deploy configs or container files that ship carry internal
   registry URLs, tokens, self-hosted runner labels, private action or image references, or
   an internal secrets store. **Major**; **Critical** with a credential. Read the export
   configuration to learn what ships, then read each shipped file end to end.
3. Test fixtures, recorded HTTP exchanges or sample data contain real tokens, real user data,
   internal hostnames or email addresses outside the public domain. **Major**; **Critical**
   when a token could still be valid. Grep fixtures for bearer and signed-token shapes,
   addresses and hostnames; compare with the obviously fake values the tree uses elsewhere.
4. Dependency manifests allow floating versions with no lockfile shipped, or the lockfile is
   present but not what the install uses; CI actions, base images or install scripts are
   referenced by mutable tag rather than pinned. **Major**. Read the manifest and lockfile
   pair; read every `uses:`, `FROM` and download line in files that ship.
5. An install, build or setup script that ships downloads and executes remote code, writes
   outside the project directory, or needs privileges it does not state. **Major**;
   **Critical** when the remote source is unpinned and unverified. Read every script on the
   export path that a README tells a user to run.
6. No security policy file (`SECURITY.md` or the ecosystem's equivalent) on a published tree,
   or the file names a contact or form that only works inside the organisation. **Minor**;
   **Major** when the contact is internal-only, since reports cannot arrive. Stat the file;
   resolve the contact from outside.

### False positives (open-source-release)

- Placeholders in `.env.example` and sample configs (`changeme`, `<your-key>`, all-zero keys);
  the general's fake-secret rule applies.
- Actions and images pinned by digest, or a lockfile deliberately absent for a library when
  the ecosystem's convention is to pin ranges in the manifest instead.
- Internal hostnames in files the export configuration excludes; verify the exclusion, then
  file nothing here.
- Example addresses and domains reserved for documentation.
