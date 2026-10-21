### Spec specifics for architecture

There is no code; the corpus is implemented by other repositories that cite it by document and
section. The architecture questions are whether the documents agree with each other, whether the
concepts they name stay distinct, and whether a change that invalidates shipped code says so.

### Always check (spec)

1. Two documents now make contradicting normative statements: a value, a boundary, an owner, a
   wire shape or an ordering fixed one way here and another way elsewhere. **Critical**. For each
   normative sentence the change adds or edits, grep the corpus for the concept's identifiers and
   read every document that fixes the same fact; quote both sides.
2. Two canonical concepts that look interchangeable are confused: an isolation or tenancy key used
   as a billing or membership bucket or the reverse, an environment label mistaken for a
   deployment environment, a display name treated as an identifier. **Critical**. Read the
   document that defines the split; for each occurrence of either identifier in the change, state
   which role the sentence needs and whether the identifier matches.
3. A concept identifier is replaced mechanically across a document (find-and-replace of one key
   for another, a rename applied everywhere). **Critical** when any occurrence changes meaning;
   **Major** when it is a vocabulary change to a backbone document without a corpus-wide sweep, a
   version bump, and a statement of what breaks in the implementing repositories. Read every
   occurrence in context; a blanket swap is almost never right.
4. A backbone document (one cited by many others: security model, tenancy model, runtime
   infrastructure, RPC contract) changes and no citing document moves. **Major**. Grep the corpus
   for the document's name; list the citing documents and read each for a statement the change
   now contradicts. Name them.
5. The change alters something that shipped code implements (a wire format, a matrix, an
   algorithm, an identifier) and is not flagged as breaking with the implementing repositories
   named. **Critical**: the corpus is the source of truth and the code follows it. Diff the
   changed section against the implementation in each sibling clone mounted for the review; name
   the file that no longer matches.
6. A document that is marked draft, superseded, scoped to another deployment mode, or carried over
   from an earlier model is cited as if settled, or a settled document is made to depend on it.
   **Major**. Read the cited document's status header and its own open-reconciliation list.
7. A decision recorded as open is assumed closed by new text (a naming scheme, a limit, a format
   "to be decided" elsewhere now fixed in passing). **Major**. Grep the decision log for the
   decision's ID or subject; its status is the evidence.

### False positives (spec)

- A document restating a value by reference ("as fixed in X §n") is not a contradiction even if
  the wording differs; only a second value is.
- A rename proposed with a full ripple sweep, a version bump and a named list of code impacts is
  the correct shape of a vocabulary change; hold it to that bar, neither wave it through nor
  reject it on principle.
- A document scoped to one deployment mode (self-hosted versus managed) does not contradict the
  other mode's document; read the scope statement before filing.
- Two identifiers that denote distinct but related entities, each used correctly, are not
  confusion; confirm the sentence's role before filing.
