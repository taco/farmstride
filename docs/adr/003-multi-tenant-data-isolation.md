# ADR 003: Multi-Tenant Data Isolation

**Status:** Accepted
**Date:** 2026-03-12

## Context

FarmStride is a multi-tenant app where each barn is an isolated tenant. Riders should only see horses, sessions, and other riders within their own barn. The question is where to enforce this isolation — in the application (resolver-level `WHERE barnId = X`), in the database (row-level security), or both.

Application-level filtering works until someone writes a resolver that forgets the filter, or a raw query that skips it, or a DataLoader that batches across barns. These bugs are silent — the app returns data instead of an error — and hard to catch in review because the _absence_ of a filter clause is invisible.

## Decision

Tenant isolation is enforced at the database level using Postgres Row-Level Security (RLS). Every request sets a session variable (`app.current_barn_id`) via `set_config()`, and RLS policies on tenant-scoped tables filter rows using `current_setting('app.current_barn_id')`.

### How it works

1. **Per-request setup.** During GraphQL context building, after JWT verification, the authenticated rider's `barnId` is written to a Postgres session variable using `set_config('app.current_barn_id', barnId, false)`. The `false` flag scopes it to the session (connection), not the transaction.
2. **RLS policies.** Tenant-scoped tables have RLS policies that filter by the current barn. `Horse` and `Rider` check their `barnId` column directly (`USING ("barnId" = current_setting('app.current_barn_id', true))`). `Session` has no `barnId` column, so its policy uses an indirect join through `Rider` (`USING ("riderId" IN (SELECT id FROM "Rider" WHERE "barnId" = ...))`). The `true` parameter on `current_setting` returns null (instead of erroring) if the variable isn't set — causing the policy to match no rows rather than crash.
3. **Transparent to application code.** Resolvers and DataLoaders don't filter by `barnId`. They write normal Prisma queries; the database silently excludes rows from other barns.

### Why database-level instead of application-level

1. **Defense in depth.** Even if a resolver bug, raw query, or new feature skips the barn filter, RLS prevents cross-barn data access. The database is the last line of defense.
2. **DataLoader safety.** DataLoaders batch by foreign key (`horseId IN (...)`) without barn awareness. RLS ensures the batch can only return rows from the current barn, even if a bug passes a horse ID from another barn.
3. **Auditability.** The complete isolation policy lives in migration files as SQL — reviewable, version-controlled, and testable independently of application code.

### What RLS doesn't cover

RLS handles read/write isolation but not authorization logic. "Can this rider edit this session?" is a role check (trainer vs. owner), not a tenancy check. Role-based guards remain in application code (see ADR 002).

## Alternatives considered

**Application-level filtering only.** Every resolver and loader adds `WHERE barnId = context.rider.barnId`. Simpler to set up (no RLS migrations), and works with any database. Rejected because it's opt-in — every query must remember to filter, and forgetting produces silent data leaks. As the codebase grows (more resolvers, more raw queries for reports/analytics), the risk compounds.

**Separate databases per barn.** Complete physical isolation — each barn gets its own Postgres database. Strongest isolation guarantee, but operationally expensive (connection pooling, migrations, backups multiply per tenant). Overkill at current scale and makes cross-barn features (if ever needed) nearly impossible.

**Schema-level isolation (Postgres schemas).** Each barn gets a schema (`barn_123.horses`), and `search_path` is set per request. Similar to RLS in enforcement strength, but harder to manage with Prisma (which assumes a single schema). Migrations would need to run per-schema. Better suited to hundreds of tenants; we have a handful.

**ORM-level scoping (Prisma middleware/extensions).** Prisma Client Extensions can inject `where: { barnId }` into every query automatically. Achieves similar transparency to RLS but at the ORM layer. Rejected because it only protects Prisma queries — raw SQL (`$queryRaw`, `$executeRaw`) bypasses it. RLS protects all queries regardless of how they reach the database.

## Consequences

- Cross-barn data access is impossible at the query level, even if application code has bugs.
- Every request pays the cost of a `set_config()` call (~0.1ms). Negligible.
- DataLoaders don't need barn-scoping logic — RLS handles it transparently.
- `set_config` must run before any Prisma query in a request. If context building is refactored, this ordering constraint must be preserved.
- RLS policies must be updated when new tenant-scoped tables are added. This is a migration step, not an application code change.
- Connection pooling works because `set_config(..., false)` is session-scoped, and Prisma's connection pool assigns one connection per request. If connection pooling strategy changes (e.g., PgBouncer in transaction mode), the `set_config` approach would need to switch to transaction-scoped (`true` flag).
