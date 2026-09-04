# Barns: Multi-Tenancy

## Context

FarmStride today is flat — all authenticated users see all horses, riders, and sessions. There's no concept of groups or organizations. In the real world, a barn (stable/facility) is the natural boundary: a trainer runs a barn, riders belong to it, horses live there.

**Current state**: Rider, Horse, Session models with no grouping. Trainers have elevated permissions globally. Sessions query is unscoped (all riders see all sessions).

**Goals**:

- Isolate data between barns — riders in Barn A never see Barn B's data
- Model the real-world relationship between trainers, riders, and horses
- Demonstrate multi-tenancy as a technical capability

## Strategic Decisions

### Barn as the tenancy boundary

Every rider and every horse belongs to exactly one barn. Sessions are implicitly scoped because both the rider and horse belong to a barn. All queries filter by `context.rider.barnId` — this is the isolation layer.

```
Barn
 ├── Riders[]
 ├── Horses[]
 └── (Sessions scoped through rider + horse)
```

**Why not a join table?** A many-to-many model (rider can be in multiple barns) is the "flexible" choice, but it adds complexity everywhere: barn switching UI, "which barn am I viewing" state, cross-barn data questions. The 1:1 constraint matches the real world for 95% of users and keeps the implementation clean. We can relax this later if needed.

### Signup requires an invite code

Signup requires a valid invite code — no code, no account. This replaces the `ALLOWED_EMAILS` env var as the access gate. The invite code is strictly better: it's scoped to a barn, shareable by the trainer, and doesn't require the operator to maintain an email allowlist.

Barns are created manually (seed script, database, or future admin tool). The trainer gets the auto-generated invite code and shares it with riders. Everyone enters a code at signup and lands in the correct barn.

This means:

- No barnless riders — every account belongs to a barn from creation
- No barn sprawl — barn creation is an intentional operator action
- `ALLOWED_EMAILS` can be removed from the signup flow

### Invite codes for joining

Auto-generated, not trainer-managed:

- A code is generated automatically when a barn is created (8-char alphanumeric, e.g. `A3K9X2M7`)
- Trainers can view it on the Me page and share it (text, whiteboard, etc.)
- Trainers can regenerate the code if it leaks — this invalidates the old one
- No expiry, no usage limit for v1
- One active code per barn at a time
- New riders enter the code on the signup form to join an existing barn

**Why not email invites?** Invite-by-email requires email infrastructure, pending invite state, and a more complex UI. A shareable code that a trainer texts or posts on a whiteboard matches how barns actually communicate. We can add email invites later as a convenience layer.

### Scoping strategy: RLS + resolver filtering (defense in depth)

Two layers of isolation, each serving a different purpose:

**Layer 1 — Postgres Row-Level Security (the safety net)**

RLS policies on `Horse`, `Rider`, and `Session` tables ensure the database itself refuses to return cross-barn data. This is the structural guarantee — even if a resolver forgets a `where` clause, a raw query runs against the DB, or someone opens Prisma Studio, the wrong rows never come back.

How it works:

1. Each request sets a Postgres session variable: `SET app.current_barn_id = '<barnId>'`
2. RLS policies on each table check `barn_id = current_setting('app.current_barn_id')`
3. This runs before Prisma sees the rows — it's invisible to application code

The policies are ~10 lines of SQL per table, written once in the migration.

**Layer 2 — Resolver filtering (the application behavior)**

Every resolver also adds `barnId: context.rider.barnId` to the Prisma `where` clause. Single-entity lookups (horse by ID, session by ID) verify the entity's barn matches the requester's barn — returning `NOT_FOUND` if it doesn't (don't leak existence).

This layer provides clean application logic, good error messages, and makes the scoping visible and testable in code. Without it, RLS would silently return empty results instead of meaningful errors.

**Why both?** RLS makes data leaks structurally impossible — the "forgot a where clause" bug is one of the most common multi-tenancy vulnerabilities, and RLS eliminates it. Resolver filtering gives you proper error handling and keeps the scoping logic auditable in application code. The cost of adding RLS is low (one-time SQL in the migration + one line per request to set the session variable) and the protection is significant.

### Trainer role stays per-rider, not per-barn

Today `RiderRole` is `RIDER | TRAINER` on the Rider model. This stays. A trainer is a trainer because of their role, and they happen to be in a barn. We don't need a separate "barn admin" concept — the trainer _is_ the barn admin.

If we later support multi-barn trainers, we'd revisit this (role could become per-barn-membership). For now, it's clean.

## Data Model Changes

### New model: Barn

```prisma
model Barn {
  id        String   @id @default(cuid())
  name      String
  inviteCode String   @unique
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  riders    Rider[]
  horses    Horse[]
}
```

### Modified models

```prisma
model Rider {
  // ... existing fields
  barnId String
  barn   Barn   @relation(fields: [barnId], references: [id])
}

model Horse {
  // ... existing fields
  barnId String
  barn   Barn   @relation(fields: [barnId], references: [id])
}
```

### GraphQL additions

```graphql
type Barn {
  id: ID!
  name: String!
  inviteCode: String    # Only visible to trainers
  riders: [Rider!]!
  createdAt: DateTime!
}

extend type Query {
  barn: Barn!            # Returns the current rider's barn
}

extend type Mutation {
  updateBarn(name: String!): Barn!
  regenerateInviteCode: Barn!
}

# Modify existing:
# signup adds optional inviteCode parameter
signup(name: String!, email: String!, password: String!, inviteCode: String!): AuthPayload! @public
```

The `Barn.inviteCode` field resolver checks `context.rider.role === TRAINER` and returns `null` for non-trainers.

## Query Scoping Changes

| Query / Resolver      | Current behavior        | After barns                              |
| --------------------- | ----------------------- | ---------------------------------------- |
| `horses`              | All active horses       | `where: { barnId, isActive: true }`      |
| `riders`              | All riders              | `where: { barnId }`                      |
| `sessions(...)`       | All sessions (unscoped) | Add `horse: { barnId }` to where         |
| `horse(id)`           | Any horse by ID         | Verify `horse.barnId === context barnId` |
| `session(id)`         | Any session by ID       | Verify through horse or rider barnId     |
| `lastSessionForHorse` | Any horse               | Verify horse barnId first                |
| `Horse.sessions`      | All sessions for horse  | Already scoped if horse is scoped        |
| `Rider.sessions`      | All sessions for rider  | Already scoped if rider is scoped        |
| `createHorse`         | Trainer only            | Set `barnId` from context                |
| `createSession`       | Owner or trainer        | Verify horse is in same barn             |

## Migration

1. Create `Barn` table
2. Create the production barn ("Field Hunter Farm") with a generated invite code
3. Set `barnId` on all existing Riders and Horses to that barn
4. Make `barnId` non-nullable
5. Enable RLS on `Horse`, `Rider`, and `Session` tables
6. Create RLS policies that filter by `current_setting('app.current_barn_id')`

Steps 1-4 are a standard Prisma migration. Steps 5-6 are raw SQL appended to the same migration (Prisma supports raw SQL in migration files). Example policy:

```sql
ALTER TABLE "Horse" ENABLE ROW LEVEL SECURITY;

CREATE POLICY barn_isolation ON "Horse"
  USING ("barnId" = current_setting('app.current_barn_id', true));
```

The `Session` table doesn't have a direct `barnId` — its policy joins through `Horse` or `Rider`:

```sql
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;

CREATE POLICY barn_isolation ON "Session"
  USING ("riderId" IN (
    SELECT id FROM "Rider"
    WHERE "barnId" = current_setting('app.current_barn_id', true)
  ));
```

### Request-level session variable

In the Fastify request lifecycle (alongside auth middleware), after resolving the rider:

```typescript
await prisma.$executeRawUnsafe(
    `SET LOCAL app.current_barn_id = '${context.rider.barnId}'`
);
```

`SET LOCAL` scopes the variable to the current transaction, so it's automatically cleaned up. This needs to run inside a transaction that wraps the request — or use `SET` (session-scoped) with care around connection pooling.

**Prisma + RLS note:** Prisma uses a connection pool. `SET LOCAL` only works inside a transaction (`prisma.$transaction`). For non-transactional queries, `SET` applies to the connection — which may be reused. The safest approach is to set the variable at the start of each request and rely on resolver filtering as the primary path, with RLS as the backstop for any code path that bypasses resolvers.

## Frontend Changes

| Area              | Change                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Signup**        | Required "Invite Code" field. Invalid code shows error.                                            |
| **Me page**       | Show barn name, member count. Trainers see invite code + share button.                             |
| **Barn settings** | Trainer-only: rename barn, regenerate invite code. Could be a section on Me page or separate page. |
| **Apollo cache**  | No change — queries already return scoped data from the server.                                    |

## Issues ([Barns: Multi-Tenancy milestone](https://github.com/taco/herdbook/milestone/7))

### [#84](https://github.com/taco/herdbook/issues/84): Add Barn model, RLS policies, and migrate existing data

Schema change: new Barn model, barnId on Rider and Horse, migration to create default barn and backfill. Enable RLS on Horse, Rider, and Session tables with barn isolation policies. Update GraphQL schema and codegen. Update seed scripts (dev + E2E) to create a default barn and assign all seed data to it. Existing tests should still pass after this issue — barn exists but nothing enforces scoping yet.

Skill: `/schema`

### [#85](https://github.com/taco/herdbook/issues/85): Scope all queries and mutations to barn

Set `app.current_barn_id` session variable in request middleware. Add `barnId` to context building. Update every resolver to filter by `context.rider.barnId`. Verify single-entity lookups check barn membership. Update all existing tests (API integration + E2E) to include barn context in setup. Add new cross-barn isolation tests that verify both resolver scoping and RLS independently. E2E smoke test for cross-barn isolation.

Skill: `/test-api`, `/e2e`

### [#86](https://github.com/taco/herdbook/issues/86): Update signup to require invite code

Signup requires a valid invite code — look up barn by code, assign rider to that barn. Remove `ALLOWED_EMAILS` validation from signup. Role defaults to RIDER; first rider in a barn can be promoted to TRAINER manually.

Skill: none (resolver logic + test)

### [#87](https://github.com/taco/herdbook/issues/87): Add barn query and management mutations

`barn` query returns current barn. `updateBarn` (trainer-only) renames barn. `regenerateInviteCode` (trainer-only) replaces the invite code.

Skill: `/test-api`

### [#88](https://github.com/taco/herdbook/issues/88): Barn UI on Me page

Show barn name and member count. Trainers see invite code with copy/share. Trainer-only section to rename barn and regenerate code.

Skill: `/new-page`, `/mobile-ux`

### [#89](https://github.com/taco/herdbook/issues/89): Add invite code field to signup form

Required invite code input on signup page. Error handling for invalid codes. Remove any `ALLOWED_EMAILS` UI references if they exist.

Skill: none (small UI change)

## Future (not in this milestone)

- **Multi-barn trainers**: Trainer belongs to multiple barns, barn switcher UI. Requires join table refactor.
- **Email invites**: Send invite link via email. Requires email infrastructure.
- **Barn deletion / archival**: What happens when a barn closes. Need data retention policy.
- **Transfer horses between barns**: Horse sale/lease scenarios.
- **Remove rider from barn**: Trainer can remove a rider they don't recognize. Need to decide what happens to their sessions.
- **Barn-level settings**: Per-barn configuration (work types, intensity scale, etc.)

## Verification

- **Isolation test**: Create two barns with test data, verify Barn A rider cannot see Barn B data through any query
- **RLS test**: Bypass resolver scoping (direct Prisma query with wrong barn session variable) and verify RLS blocks access
- **Signup test**: Verify invite code flow and no-code flow both work
- **Migration test**: Run migration against seeded database, verify all data lands in default barn
- **Trainer permissions**: Verify only trainers can see invite code, rename barn, regenerate code
- **Schema check**: `pnpm run check` passes
