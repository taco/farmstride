---
description: Pre-PR code review — delegates generic bug-hunting to the built-in /code-review, then runs FarmStride-specific checks (auth/tenancy, schema sync, AI conventions, mobile web). Run after /preflight, before pushing.
allowed-tools: Bash, Read, Glob, Grep, Task, Skill
---

# /pre-review — Pre-PR Code Review

## Usage

- `/pre-review` — review all changes on the current branch vs main (high effort)
- `/pre-review <level>` — override effort: `low` | `medium` | `high` | `xhigh` | `max` | `ultra` (cloud multi-agent)

## Purpose

Two review passes, merged into one report:

1. **Generic pass** — the built-in `/code-review` skill handles correctness bugs, logic errors, and cleanup findings. It has its own multi-agent adversarial verification; do not duplicate that machinery here.
2. **FarmStride pass** — project-specific conventions a generic review won't reliably check: auth/tenancy model, schema sync, AI feature conventions, mobile web patterns.

Run this **after** `/preflight` passes and **before** pushing or creating a PR.

## Workflow

### 1. Scope the change

```bash
git branch --show-current          # must not be main
git diff main...HEAD               # committed changes (full text — mechanical checks and agents need it)
git diff HEAD                      # uncommitted changes
git log main..HEAD --oneline
```

Keep the full diff text — step 3's mechanical checks grep it and the domain agents receive their slice of it. `--stat` alone is not enough.

Note which domains the diff touches — this decides which FarmStride checks run in step 3:

| Domain touched   | Signal                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Auth/tenancy** | `schema.graphql` field changes, resolvers, `authGuard.ts`, `directives.ts`, anything under `/api/dev/` |
| **Schema/data**  | `schema.prisma`, `migrations/`, `schema.graphql`, `loaders.ts`, resolvers                              |
| **AI**           | `packages/api/src/prompts/`, `parseSession.ts`, `generateSummary.ts`, model/env config                 |
| **Web**          | anything in `packages/web`                                                                             |

### 2. Run the generic review

Invoke the built-in review via the Skill tool: `skill: "code-review"` with args naming only the effort level (default `high`). Do **not** pass a branch or path target — the no-target default reviews the branch's committed changes _plus_ the working tree, whereas an explicit target narrows scope and silently drops uncommitted work. Always pass the level explicitly (`/code-review` otherwise reuses whatever level was last typed).

Collect its findings for the merged report in step 5.

### 3. Run the FarmStride-specific checks

#### Mechanical checks (run directly — no agents)

- `schema.prisma` changed without a matching `schema.graphql` change (or vice versa)
- Bare `TODO`/`FIXME` in the diff without `TODO(#N)` format
- New `@public` directives in the diff (each needs justification — see below)
- Migrations adding `NOT NULL` to existing tables without a backfill step ordered first
- New dependencies in any `package.json` (flag suspicious ones; bundle size is CI's job)

#### Domain agents

For each domain the diff touches (per step 1), launch one review agent. Agents inherit the session model — do not hardcode model names. Use high reasoning effort for the auth/tenancy agent; default effort for the rest.

Each agent starts with **zero conversation context**: give it the diff for its domain, the change summary, and the pointers below — then let it **read the repo** (Read/Grep) to verify findings against surrounding code. A finding is only reportable if the agent tried to refute it first: checked that it's actually reachable, introduced by this diff (not pre-existing), and not already handled elsewhere.

**Auth/tenancy agent** — reference `docs/adr/002-graphql-authorization-strategy.md` and `docs/adr/003-multi-tenant-data-isolation.md`. (This checklist has a condensed twin in `.github/workflows/claude-review.yml` — keep the two in sync when conventions change.)

- Auth is secure-by-default via `secureByDefaultTransformer` — flag new inline `if (!context.rider)` checks (they're a violation, not a fix)
- New `@public` fields: is public exposure actually intended?
- Role/ownership guards use the shared helpers (`getBarnId`, `requireTrainer`, `requireOwnerOrTrainer`)
- **Barn scoping**: every query/mutation filters by `barnId` from context — a resolver querying without it is a cross-tenant data leak
- Rider queries use `omit: { password: true }`
- Dev-only surfaces (`/api/dev/`, introspection, debug flags) fail **closed** in production
- New mutations wrapped with `wrapResolver()` for rate limiting
- New mutations have access-control tests (barn isolation, role enforcement); new REST endpoints have rate-limit tests

(Generic security — raw SQL, secrets, unbounded inputs, XSS — is `/code-review`'s job; don't re-scan for it here.)

**Schema/data agent** — checks beyond the mechanical sync check:

- Field resolvers use `context.loaders.*`, not direct Prisma (N+1); new field resolvers need loaders added to `loaders.ts`
- Missing resolver implementations or codegen for new schema fields
- Breaking GraphQL changes (nullability, removed fields)
- New FKs have an explicit ON DELETE strategy; enum removals are breaking; new WHERE-clause fields need `@@index()`
- Error consistency: resolvers throw `GraphQLError` with codes (`NOT_FOUND`, `BAD_USER_INPUT`, `FORBIDDEN`) — never return null for non-nullable fields
- New tables get their own `deleteMany()` line in FK-safe order in the E2E `resetDatabase()` (`packages/e2e/tests/utils/resetDatabase.ts`)

**AI agent** — reference `docs/ai-guidelines.md` and `docs/adr/004-ai-feature-architecture.md`:

- Prompts live in `packages/api/src/prompts/` as versioned `PromptConfig` — no inline prompt strings
- New features have a `<FEATURE>_MODEL` env override and default to the floor tier
- AI endpoints use `withAiRateLimit()`
- The feature-assignments table in `docs/ai-guidelines.md` was updated

**Web agent** — reference `docs/design/navigation.md` (layouts, view/edit cascade, drawer editing):

- Apollo cache: mutations evict the right fields; multi-user-sensitive queries use `cache-and-network`
- Explicit `isLoading` handling (`loading && !data` on first load); specific user-facing error messages via the `formError` pattern
- Route-level auth guards on new routes (not component-level checks)
- Touch targets ≥ 44x44px; tab-layout pages have bottom-bar padding; overlays trap focus (dialog primitive, not raw `fixed inset-0`)
- E2E data isolation: new tests create unique data (`Date.now()` suffixes) instead of mutating shared seed data
- Browser coverage: UI changes work in both Chromium (smoke) and WebKit/Safari (regression) viewports
- **Domain cleanup**: dead code, stale mocks, misleading names in the same feature area belong in this PR (cleanup principle)

### 4. Dedup

Before reporting, merge duplicates: the generic pass and a domain agent will often flag the same line. Keep the version with the strongest evidence.

### 5. Merge and report

One table, both passes combined, sorted by severity:

```
## Pre-PR Review

Reviewed N files, M commits against main. Generic pass: /code-review (<level>). FarmStride pass: <domains run>.

| # | Severity | Fix? | Issue | Impact |
|---|----------|------|-------|--------|
| 1 | High | Yes | `file.ts:NN` — description | What breaks or what risk it creates |
| 2 | Medium | Yes | `file.ts:NN` — cleanup item in same domain | Why it matters |
| 3 | Low | No | `file.ts:NN` — minor item | Low-probability scenario |

Fix? = recommendation. High is always Yes. Medium is Yes when in the same domain as the change (cleanup principle). Low is typically No.

**Action needed:** N issues recommended to fix. Reply with row numbers to override (e.g. "include 3" or "skip 2").
```

If nothing survives: state that, and list what was checked (generic review level + which domain checks ran).

### 6. Next steps

- Present the table and wait for the user to confirm or override recommendations
- Fix confirmed items, re-run `/preflight`
- If any High items were fixed, re-run `/pre-review`
- If clean: proceed to push and PR creation

## Key Rules

1. **Don't duplicate `/code-review`** — no hand-rolled bug-scanner agents; the built-in's adversarial verification handles generic correctness.
2. **Conditional domains** — only run domain checks the diff actually touches.
3. **Refute before reporting** — agents verify findings against the repo; unverified suspicion doesn't make the table.
4. **Changed code + same-domain cleanup only** — don't flag pre-existing issues in unrelated files.
5. **No builds** — format, typecheck, and tests are `/preflight`'s job.
6. **Evidence-based** — every finding cites specific code, a CLAUDE.md rule, or an ADR.
