# Reviewing a change

The brief for every review of FarmStride code: the automatic PR review (`.github/workflows/claude-review.yml`), `@claude` re-reviews (`.github/workflows/claude.yml`), and the local review passes in `CLAUDE.md` → Skills → "Code review". It says what a review is for and what this repo cares about. Where to look is the reviewer's call.

## What the review is for

Finding what should change before the PR merges. Read the change, work out what it is trying to do, and judge whether it does that safely.

- **Correctness bugs.** Logic errors, unhandled cases, broken callers, code that behaves differently from what it claims.
- **Tenant and auth leaks.** Data crossing a barn boundary, or reaching someone who isn't logged in or lacks the role for it.
- **Whether the change does what it says.** Compare the diff with the PR description and any linked issue. Look for missing pieces, unrequested extras, and behavior that contradicts the stated intent.
- **Anything a careful reader would flag as risky.** New dependencies, dev-only surfaces reachable in production, secrets in code, a migration that can't run against existing data.

## What to skip

Formatting, type hygiene and style; CI owns those. Skip nitpicks and suggestions that add complexity without a clear payoff.

Only comment when something should change. A finding is worth posting once it has been checked against the surrounding code: it is reachable, this change introduced it, and nothing else already handles it.

## What has mattered in this repo

Background on the invariants this codebase leans on. They are context for judgment, not steps to walk through. A change that breaks one is usually a real finding.

- **Auth is secure by default.** `secureByDefaultTransformer` rejects unauthenticated requests for every field not marked `@public`, before resolvers run (`docs/adr/002-graphql-authorization-strategy.md`). A new `@public` field needs a reason to be public. An inline `if (!context.rider)` check is a mistake rather than a safeguard; role and ownership checks go through the shared helpers `getBarnId`, `requireTrainer` and `requireOwnerOrTrainer`.
- **Barn scoping comes from context.** Every query and mutation filters by the `barnId` taken from the request context, never one the client supplies (`docs/adr/003-multi-tenant-data-isolation.md`). A resolver that queries without it leaks data across tenants.
- **Password hashes stay on the server.** Rider queries use `omit: { password: true }`.
- **Dev-only surfaces fail closed.** `/api/dev/` routes, GraphQL introspection and debug flags stay off unless the environment is explicitly development.
- **Raw SQL is parameterized.** `$queryRaw` and `$executeRaw` appear only as tagged templates, never as built strings.
- **GraphQL inputs are bounded.** List arguments carry limits, and nothing lets a client ask for unbounded pages or nesting.
- **Field resolvers use DataLoaders.** They read through `context.loaders.*` rather than calling Prisma directly, so composed queries don't turn into N+1; a new field resolver brings its loader in `loaders.ts`.
- **`schema.prisma` and `schema.graphql` move together.** A change to one without the other is usually an oversight.

## Reporting on a PR

Put each line-specific finding on the lines it concerns. Close with a short summary in your own words: a one-line verdict, then whatever should be fixed before merging. The review is advisory and does not gate the merge.
