### Open-source-release specifics for documentation

Files on the export path are read by people who cannot ask the author and must not see what
the author's organisation keeps private. Two failures matter: a stranger cannot get started,
and an internal reference leaves with the export.

### Always check (open-source-release)

1. The README does not take a stranger from nothing to a working call: no statement of what
   the project is for, no list of capabilities, no install or quick-start block, no links to
   fuller docs and examples, no licence statement. **Major** for a missing README or install
   path; **Minor** for a missing section. Run the quick start in a scratch directory.
2. No LICENSE file, or the licence named in file headers, package metadata and README
   disagrees with it. **Major**. Stat the file; grep SPDX or header lines and the manifest's
   licence field; cite the mismatch.
3. An example or demo has no README of its own stating what it does, what it needs (runtime,
   credentials, services) and how to run it, or does not run as written. **Major** when the
   top-level README links to it; **Minor** otherwise. Run it with the prerequisites it states.
4. The changelog is absent on a published tree, or an entry points at internal material
   (ticket, private thread) instead of stating the change. **Minor**; **Major** when the entry
   is the only description of a breaking change. Read the entries the diff adds.
5. An added or changed line in an export-path file names internal-only material: a private
   organisation or repository, a ticket ID, an internal hostname, a personal handle, or a
   sibling internal project in prose. **Major**; **Minor** when pre-existing and untouched.
   Grep the diff hunks, not the whole tree: the diff is the gate that keeps a clean export
   clean. The leak is rarely a literal repository name; search for a sibling-project or
   sibling-language name next to a relationship word (parity, mirror, reference, equivalent,
   lock-step, verifier), for "every SDK" or "the whole family", and for file pointers with a
   sibling language's extension inside comments, test names, CI files and the changelog.
   Allow: the public organisation and its repositories, third-party dependencies, standards
   numbers (RFC, CWE), cross-references to paths inside this repository, and the author's
   email at the public domain. When flagging, propose the rewrite that keeps the technical
   rationale and drops the pointer ("the verifier compares the path byte-for-byte, per the
   cited section"), not a deletion.

### False positives (open-source-release)

- The public organisation's name, its public repositories and public package coordinates.
- "Mirrors", "same as" or "see" pointing at a path or symbol inside this repository.
- Standards and vulnerability identifiers; vendor names of third-party dependencies.
- Internal references in files the export configuration excludes; read the configuration
  before filing, and leave an accidental exclusion to code-structure.
- Commit messages: the export squashes or rewrites them; only file contents ship.
