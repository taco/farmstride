# FarmStride Development Guidelines

## Agent Workflow

Use lead/builder/verifier pattern. Don't hardcode model names in skills, plans, or prompts — subagents inherit the session model, and named generations go stale. Steer cost with **reasoning effort** instead:

### Effort Allocation

- **Low effort**: Exploration, file searches, running commands, simple mechanical tasks
- **Default effort**: Most implementation, standard code reviews, test writing
- **High effort**: Planning, security review, complex architectural decisions

Pin a specific model only at the extremes, and only where it demonstrably matters: a smaller model (e.g. Haiku) for high-volume mechanical fan-out where speed and cost dominate, or a frontier tier (e.g. Fable) for a single hard problem where high effort on the session model falls short.

### Workflow

1. Explore (low effort)
2. Plan (high effort)
3. Build (default effort)
4. Verify (default effort; high for security-critical)

### Planning Convention

Every plan must include a **Skills** section that maps each implementation step to the skill that governs it. If no skill applies, write "none". This makes skill usage visible and reviewable.

Example:

```
## Skills
| Step | Skill | Why |
|------|-------|-----|
| Add birthDate to Horse model | `/schema` | Prisma → migration → GraphQL → resolver → codegen |
| Build horse profile page | `/new-page` | New FullScreenLayout page with view/edit |
| Write resolver tests | `/test-api` | Integration test for new query |
| Pre-commit checks | `/preflight` | Format + typecheck |
| Pre-PR review | `/pre-review` | Independent review before push |
```

Plans must always include `/pre-review` after `/preflight`, in both the Skills table and the Verification section. (Trial caveat: while the mattpocock-skills trial is active — see Skills section — work done via `/implement` uses its built-in code-review in place of `/pre-review`; `/preflight` is still required.)

## Commands

- Always use `pnpm` (not npm)
- Always use `pnpm run <script>` instead of `pnpm <script>` shorthand
- Run `pnpm run format` after making changes
- Run `pnpm run check` before committing (runs format:check + typecheck)

## Tech Stack

- **Monorepo**: pnpm workspaces
- **API**: Node/Fastify, Prisma, GraphQL
- **Web**: React/Vite, Tailwind CSS (mobile-only)
- **Testing**: Vitest, React Testing Library

## Cleanup Principle

Leave the codebase slightly better than you found it. When a change reveals nearby issues — stale mocks, dead code, misleading names, missing cache invalidation — fix them in the same PR rather than deferring. The context cost of "fix it later" (tracking issues, reloading mental state) almost always exceeds the cost of doing it now.

**Belongs in the PR:** cleanup in the same domain as your change — the files you're touching, plus closely related code in the same feature area (e.g., auth flow, data model, shared types).
**Separate PR:** unrelated refactors in files you happened to read.

## Code Style

- No `any` types in TypeScript
- Explicit return types for public functions
- Files: `PascalCase.tsx` (components), `camelCase.ts` (utilities)
- Types: `PascalCase` (no `I` prefix)
- TODOs must use `TODO(#N)` format referencing a real GitHub issue — no bare `TODO`, `FIXME`, or placeholder issue numbers

## AI Features

- **Model selection**: see [docs/ai-guidelines.md](docs/ai-guidelines.md) for model tiers, pricing, and patterns
- Floor tier (`gpt-5-mini`) is the default — only upgrade with real data showing it's insufficient
- Every AI prompt lives in `packages/api/src/prompts/` as a versioned `PromptConfig`
- Every AI feature gets a `<FEATURE>_MODEL` env var override
- All AI endpoints must use `withAiRateLimit()`
- Route every OpenAI call through `tracedChatCompletion()`/`withGenAiSpan()` from `utils/tracing.ts` (GenAI semantic conventions: model + token usage, never prompt or completion text)
- **When adding or changing AI features**, update the "Current feature assignments" table in `docs/ai-guidelines.md`

## Backend (packages/api)

- Direct-to-Prisma in resolvers (no service layer)
- Throw `GraphQLError` with codes (`NOT_FOUND`, `BAD_USER_INPUT`, `FORBIDDEN`) for data lookup failures and validation — don't return null for non-nullable fields
- Auth is handled by `secureByDefaultTransformer`, which rejects unauthenticated requests for all non-`@public` fields before resolvers run. Do not add inline `if (!context.rider)` checks — use `context.rider!` (non-null assertion) for TypeScript. Use shared helpers (`getBarnId`, `requireTrainer`, `requireOwnerOrTrainer`) for role-based guards and type narrowing.
- Update `schema.graphql` when `schema.prisma` changes
- **Tracing**: OpenTelemetry → Honeycomb, gated on `HONEYCOMB_API_KEY` (`telemetry.ts`). Tag requests with tenant IDs via `setDomainAttributes()` (`herdbook.*` attributes, opaque IDs only). Sentry is errors-only.
- **Field resolvers must use DataLoaders** (`context.loaders.*`), not direct Prisma calls. Add new loaders to `loaders.ts` when adding field resolvers. This keeps the pattern uniform and prevents N+1 queries regardless of how queries are composed.

## Frontend (packages/web)

- Mobile-only styling (no desktop)
- Use existing Shadcn components in `components/ui/`
- Explicit `isLoading` state (no Suspense for data)
- Local state preferred (`useState`/`useReducer`)
- Touch targets: minimum 44x44px
- **Navigation & layouts**: see [docs/design/navigation.md](docs/design/navigation.md) for layout types, sub-page overlay system, view/edit cascade, drawer-based editing, animation standards, and the new page checklist
- **Error handling**: `useState<string | null>(null)` for `formError`, try/catch with `setFormError(err instanceof Error ? err.message : 'An error occurred')`, display with `<p className="text-sm text-red-500">`. Browser APIs (clipboard, share) silently degrade — no error display

## Security

- Every resolver checks `context.rider` unless public
- Data ownership: users only access their own data
- No secrets in code

## Git

- Conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`
    - `feat`: user-facing capability (new feature, new page, new endpoint)
    - `fix`: bug fix
    - `chore`: infrastructure, tooling, CI, dependencies, monitoring (e.g., adding Sentry)
    - `docs`: documentation only
    - `refactor`: code restructuring, no behavior change
- Prefer `git add <file>` over `git add .`
- Do not add any co-author lines in commit messages
- The top message should be short and easy to read without losing context
- Seperate details should be order in terms for weight, most important at the top

## Worktrees

Parallel work uses Claude Code's native worktrees (the old `/worktree` skill is retired):

- Start a session in a worktree: `claude -w issue-<number>` (or any name; `claude -w "#<PR>"` branches from a PR). Worktrees live under `.claude/worktrees/` and branch from up-to-date `origin/main`.
- Gitignored env files and local SSL certs are copied into new worktrees automatically via `.worktreeinclude` (repo root).
- Fresh worktree setup (once per new worktree): `pnpm install && pnpm run env:local && pnpm --filter api exec prisma generate` (use `env:neon-dev` instead if working against Neon). The `env:*` step is required — `packages/api/.env` is a symlink, which `.worktreeinclude` cannot copy.
- Rename the auto-generated `worktree-*` branch to the conventional form before pushing: `git branch -m <type>/<issue>-<slug>` (e.g. `fix/42-login-crash`), using the commit-type prefixes above.
- Clean up finished worktrees with `git worktree remove <path>` (add `--force` if dirty).

## Project Board

All issues are tracked in the [Herdbook Backlog](https://github.com/users/taco/projects/1) GitHub Project (project #1, owner: taco).

- **Priority lives on the board** (custom field), not in labels. Do not create priority labels.
- Every new issue must be added to the project with **Priority**, **Type**, and **Package** fields set (see `/write-issue` skill for field IDs).
- When starting work on an issue, set its Status to **In Progress** (see `/gh-issue` skill).
- **Active milestone**: Marked with `[ACTIVE]` prefix in its GitHub description. Issues in the active milestone default to P2-medium; other milestones default to P3-low. Bugs always default to P1-high regardless of milestone.
    - Query: `gh api repos/taco/herdbook/milestones --jq '.[] | select(.description | startswith("[ACTIVE]"))'`
    - To change: remove `[ACTIVE]` from old milestone description, add to new one.
- Cherry-picking across milestones is fine — priority on the board is the final word on what to work next.

## Design Docs

- After `/design` creates issues on GitHub, update the design doc's issue headings to use real issue numbers with full links: `### [#84](https://github.com/taco/herdbook/issues/84): Title`
- Link the milestone in the Issues section heading
- Code TODOs for future work must reference the real issue: `TODO(#84)`

## Testing Philosophy

- Tests are liability - only write high-ROI tests
- Integration over unit tests
- Don't test: UI structure, third-party code, trivial code
- Use `fastify.inject()` for API tests
- Use `getByRole`/`getByText` for frontend tests

## Skills

Use these skills for common workflows. Invoke with `/skillname` or the Skill tool.

| Task                               | Skill             |
| ---------------------------------- | ----------------- |
| Mobile UX analysis for new feature | `/mobile-ux`      |
| Creating a new page                | `/new-page`       |
| Schema/model changes               | `/schema`         |
| E2E tests (dev, smoke, regression) | `/e2e`            |
| Writing web unit tests             | `/test-web`       |
| Writing API integration tests      | `/test-api`       |
| Pre-commit checks                  | `/preflight`      |
| Railway preview deploys            | `/deploy-preview` |
| Update docs after changes          | `/updatedocs`     |
| Implement a GitHub issue           | `/gh-issue`       |
| Write a well-scoped GitHub issue   | `/write-issue`    |
| Pre-PR independent code review     | `/pre-review`     |
| Design conversation before coding  | `/design`         |

### Workflow trial: mattpocock-skills (started 2026-08-31)

We are trialing the `mattpocock-skills` flow as the **primary** idea → ship workflow. The Herdbook flow skills below stay installed as the fallback; to end the trial, delete this subsection and the trial caveats elsewhere in this file.

During the trial, use the Matt flow for these stages instead of the Herdbook-flow equivalents:

| Stage                                     | Use (trial)                                        | Replaces                   |
| ----------------------------------------- | -------------------------------------------------- | -------------------------- |
| Sharpening an idea                        | `/grill-with-docs` (leaves `CONTEXT.md` + ADRs)    | `/design`                  |
| Spec + tickets for multi-session work     | `/to-spec` → `/to-tickets`                         | `/write-issue`             |
| Implementing a ticket (fresh context per) | `/implement` (drives `/tdd`, runs its code-review) | `/gh-issue`, `/pre-review` |
| Incoming raw bugs/requests                | `/triage`                                          | ad-hoc issue writing       |
| Hard bug, flake, or regression            | `/diagnosing-bugs`                                 | —                          |
| Foggy multi-session effort                | `/wayfinder` → hands off to `/to-spec`             | —                          |

Standalone additions usable any time: `/prototype`, `/resolving-merge-conflicts`, `/research`, `/wizard`, `/handoff`.

**Still mandatory during the trial** (FarmStride-specific; the Matt flow doesn't know these):

- `/preflight` before every commit — format + typecheck are non-negotiable
- Domain skills whenever applicable: `/schema`, `/new-page`, `/mobile-ux`, `/test-api`, `/test-web`, `/e2e`, `/deploy-preview`, `/updatedocs`
- Project board conventions: issues created by `/to-tickets` or `/triage` still get Priority/Type/Package fields on the board, and Status → In Progress when picked up
- Git conventions above (conventional commits, no co-authors)
- Testing Philosophy above: `/tdd` inside `/implement` is fine, but keep tests high-ROI and integration-focused — no red-green-refactoring trivial code

**Precondition**: run `/setup-matt-pocock-skills` once before the first flow, pointing it at the existing GitHub Project board (custom trackers are supported). Do not let it create priority labels — priority lives on the board.

## Agent skills

### Issue tracker

Issues live in GitHub Issues and must land on the Herdbook Backlog project board. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at root (created lazily) + existing `docs/adr/`. See `docs/agents/domain.md`.

## Honeycomb MCP Usage

When working with Honeycomb:

- Always call `get_workspace_context` first to understand available environments and datasets
- Use `find_columns` or `get_dataset_columns` to discover fields before running queries
- Use human-readable time ranges (e.g., "last 2 hours", "24h") — avoid epoch timestamps
- Specify the environment and dataset explicitly in every query

## New Feature Workflow

(Trial caveat: while the mattpocock-skills trial is active, steps 0, and 6–7's review, follow the trial table in the Skills section instead: `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement`. Steps 1–5 and `/preflight` still apply inside implementation.)

0. Design conversation (if needed) → `/design`
1. Mobile UX analysis → `/mobile-ux`
2. Define schema (Prisma + GraphQL) → `/schema`
3. Implement resolvers
4. Build UI and connect → `/new-page`
5. Write tests → `/test-api`, `/test-web`, `/e2e`
6. Pre-commit check → `/preflight`
7. Pre-PR review → `/pre-review`
8. Update docs → `/updatedocs`
