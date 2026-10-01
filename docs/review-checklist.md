# Review checklist

FarmStride-specific standards for any code review (the standards + spec review inside `/implement`, the built-in `/code-review` bug hunt, the PR review workflow — see `CLAUDE.md` → Skills → "Code review"). Generic correctness and security — bugs, raw SQL, secrets, unbounded inputs, XSS — belong to the reviewer's own pass; this file lists what a generic review won't reliably catch.

Run the mechanical checks on every diff, then only the domain sections the diff touches. A finding is reportable once it is verified against the surrounding code: reachable, introduced by this diff, and not already handled elsewhere. Every finding cites specific code, a `CLAUDE.md` rule, or an ADR. Format, typecheck, and tests are `/preflight`'s job.

| Domain           | Applies when the diff touches                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Auth/tenancy** | `schema.graphql` field changes, resolvers, `authGuard.ts`, `directives.ts`, anything under `/api/dev/` |
| **Schema/data**  | `schema.prisma`, `migrations/`, `schema.graphql`, `loaders.ts`, resolvers                              |
| **AI**           | `packages/api/src/prompts/`, `parseSession.ts`, `generateSummary.ts`, model/env config                 |
| **Web**          | anything in `packages/web`                                                                             |

## Mechanical checks

- `schema.prisma` changed without a matching `schema.graphql` change (or vice versa)
- Bare `TODO`/`FIXME` in the diff without `TODO(#N)` format
- New `@public` directives in the diff (each needs justification — see Auth/tenancy)
- Migrations adding `NOT NULL` to existing tables without a backfill step ordered first
- New dependencies in any `package.json` (flag suspicious ones; bundle size is CI's job)

## Auth/tenancy

Reference `docs/adr/002-graphql-authorization-strategy.md` and `docs/adr/003-multi-tenant-data-isolation.md`. This list has a condensed twin in `.github/workflows/claude-review.yml` — keep the two in sync when conventions change. Security-critical: review at high effort.

- Auth is secure-by-default via `secureByDefaultTransformer` — flag new inline `if (!context.rider)` checks (they're a violation, not a fix)
- New `@public` fields: is public exposure actually intended?
- Role/ownership guards use the shared helpers (`getBarnId`, `requireTrainer`, `requireOwnerOrTrainer`)
- **Barn scoping**: every query/mutation filters by `barnId` from context — a resolver querying without it is a cross-tenant data leak
- Rider queries use `omit: { password: true }`
- Dev-only surfaces (`/api/dev/`, introspection, debug flags) fail **closed** in production
- New mutations wrapped with `wrapResolver()` for rate limiting
- New mutations have access-control tests (barn isolation, role enforcement); new REST endpoints have rate-limit tests

## Schema/data

- Field resolvers use `context.loaders.*`, not direct Prisma (N+1); new field resolvers need loaders added to `loaders.ts`
- Missing resolver implementations or codegen for new schema fields
- Breaking GraphQL changes (nullability, removed fields)
- New FKs have an explicit ON DELETE strategy; enum removals are breaking; new WHERE-clause fields need `@@index()`
- Error consistency: resolvers throw `GraphQLError` with codes (`NOT_FOUND`, `BAD_USER_INPUT`, `FORBIDDEN`) — never return null for non-nullable fields
- New tables get their own `deleteMany()` line in FK-safe order in the E2E `resetDatabase()` (`packages/e2e/tests/utils/resetDatabase.ts`)

## AI

Reference `docs/ai-guidelines.md` and `docs/adr/004-ai-feature-architecture.md`.

- Prompts live in `packages/api/src/prompts/` as versioned `PromptConfig` — no inline prompt strings
- New features have a `<FEATURE>_MODEL` env override and default to the floor tier
- AI endpoints use `withAiRateLimit()`
- The feature-assignments table in `docs/ai-guidelines.md` was updated

## Web

Reference `docs/design/navigation.md` (layouts, view/edit cascade, drawer editing).

- Apollo cache: mutations evict the right fields; multi-user-sensitive queries use `cache-and-network`
- Explicit `isLoading` handling (`loading && !data` on first load); specific user-facing error messages via the `formError` pattern
- Route-level auth guards on new routes (not component-level checks)
- Touch targets ≥ 44x44px; tab-layout pages have bottom-bar padding; overlays trap focus (dialog primitive, not raw `fixed inset-0`)
- E2E data isolation: new tests create unique data (`Date.now()` suffixes) instead of mutating shared seed data
- Browser coverage: UI changes work in both Chromium (smoke) and WebKit/Safari (regression) viewports
- **Domain cleanup**: dead code, stale mocks, misleading names in the same feature area belong in this PR (cleanup principle)
