# Request protocol over agent-link

The coordinator is an agent-link peer (default name `code-reviewer`) in the company's
workspace. Any peer, including the human at the relay, sends it a markdown message whose
first fenced `yaml` block is the request. Text after the block is passed to the specialists
as requester context.

## Request

````markdown
```yaml
action: review          # review | rereview | status
target: acme/widgets#123
types: [security, testing]   # optional; the project manifest decides otherwise
post: false                  # optional; whether to post on GitHub (PRs only)
```
This PR replaces the token cache; please focus on invalidation.
````

Target grammar:

| Target | Form | Notes |
|---|---|---|
| pull request | `owner/repo#N` | reviewed at its head, diff against the merge-base |
| audit | `owner/repo@ref` plus optional `paths: [dir, ...]` | whole tree or scoped |
| local tree | `local:/absolute/host/path` plus optional `ref` (base) and `paths` | never published; the path must be under one of the deployment's `local_roots` |

`action: status` with an optional `run: <id>` asks for status and creates no run.

Expectations: send with `reply` to get the acknowledgement and the final result; with
`updates` to also get a message at each state change; `none` for fire-and-forget (the result
still goes to the deployment's notify peer).

## Replies

1. **Acknowledgement**: run id, target, action; then, after resolution, the project matched,
   the types that will run (with models) and whether the review will be posted.
2. **Final** (`final: true`): the verdict line, counts by severity, the host path of
   `review.md`, and for a posted PR the verdict posted.
3. **Blocked**: the coordinator asked the human relay a question (unknown repo, path outside
   the mounted roots, posting forbidden by policy, unknown review type). The requester is told
   what was asked; the run resumes when the human answers.
4. **Failed**: the reason (prep failure, specialist failure, token cap, posting refused).

Questions about a finished review ("why is security-2 Major?") are answered from the run's
findings and review files, in the same conversation.

## Examples

A coding agent, before opening a PR:

````markdown
```yaml
action: review
target: local:/home/dev/work/widgets
ref: main
types: [security, testing, coding-practices]
```
Branch feat/token-cache; I rewrote internal/token/cache.go. Tests pass locally.
````

A human asking for an audit of one package:

````markdown
```yaml
action: review
target: acme/widgets@main
paths: [internal/token]
types: [security, system-design]
```
````

Status of a run:

````markdown
```yaml
action: status
run: 2026-10-11T14-03-22Z-acme-widgets-123
```
````
