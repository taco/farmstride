---
description: Pre-commit quality gate — runs formatting check, TypeScript typecheck, and optionally unit tests. Diagnoses and fixes common failures.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# /preflight — Pre-Commit Quality Gate

## Usage

- `/preflight` — format check + typecheck
- `/preflight fix` — auto-fix formatting, then typecheck
- `/preflight full` — format check + typecheck + unit tests

## Commands

```bash
pnpm run check           # format:check && typecheck
pnpm run format          # auto-fix formatting
pnpm run typecheck       # TypeScript only
pnpm run test            # unit tests (API + web)
```

## Common Fixes

| Symptom                          | Fix                                     |
| -------------------------------- | --------------------------------------- |
| Formatting errors                | `pnpm run format`                       |
| Errors in `generated/graphql.ts` | `pnpm --filter web run codegen`         |
| Cannot find `@prisma/client`     | `pnpm --filter api run prisma:generate` |
| Stale types after schema change  | Run both generate commands above        |

## Workflow

1. Run the appropriate command
2. If errors: diagnose, fix, re-run `pnpm run check`
3. Report result

Auth and tenancy checks are not part of preflight. The review passes that follow it own them (`CLAUDE.md` → Skills → "Code review", invariants in `docs/agents/review.md`).
