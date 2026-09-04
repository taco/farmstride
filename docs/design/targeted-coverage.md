# Targeted Branch Coverage

## Context

FarmStride iterates fast with AI-assisted development. Code gets written quickly, but review can miss untested branches — especially auth checks, data ownership guards, and business logic in resolvers. There's no visibility into what's covered today: no coverage tooling configured, no thresholds, no CI gates.

**Current state**: 13 API test files with strong access control coverage, but no way to verify completeness. Vitest coverage is not configured. CI runs tests but doesn't report what they exercise.

**Goal**: Know — not trust — that critical branches are tested. Surface gaps automatically without slowing iteration.

**Non-goals**: Project-wide coverage targets. Testing UI structure or framework behavior. Mutation testing.

## Strategic Decisions

### Coverage only on critical files, not the whole project

A project-wide coverage number incentivizes testing boilerplate to hit a target. Instead, configure thresholds on specific files where a missed branch is a real bug:

- `resolvers.ts` — auth checks, data ownership, business logic
- `parse-session.ts` — input parsing branches
- `aiRateLimit.ts` — rate limiting logic
- `src/test/access/*.test.ts` patterns confirm auth, but the resolver file itself needs branch coverage

Everything else gets coverage _reported_ but not _enforced_. You can see it, but CI won't fail over an untested utility function.

### Branch coverage, not line coverage

Line coverage rewards verbose code. Branch coverage answers the real question: "is every `if/else` path exercised?" This is the metric that catches missed auth checks and unhandled error paths.

### Bake verification into the AI workflow

The AI writes code fast — the AI should also verify its own coverage. Update `/pre-review` and `/test-api` skills to run coverage and flag untested branches before the PR is created. This catches gaps before human review, not after.

## Issues ([Targeted Branch Coverage](https://github.com/taco/herdbook/milestone/8))

### [#100](https://github.com/taco/herdbook/issues/100): Configure branch coverage on critical API files with CI gate

Add `@vitest/coverage-v8` to packages/api. Configure `vitest.config.js` with coverage thresholds targeting critical files — branch coverage at 80% for resolvers, auth, and business logic files. Update `.github/workflows/ci.yml` to run `vitest run --coverage` in the api-test job and fail on threshold violations. Coverage reports uploaded as CI artifacts for inspection.

**Skills**: none (vitest config + CI yaml)

### [#101](https://github.com/taco/herdbook/issues/101): Integrate coverage checks into AI workflow skills

Update `/pre-review` skill to run `vitest --coverage` on changed API files and flag any untested branches in its review output. Update `/test-api` skill to verify branch coverage on the file under test after writing tests, iterating if critical branches are missed. Both skills should report the specific uncovered branches, not just a percentage.

**Skills**: none (skill prompt updates)

**Depends on**: #100

## Verification

- Push a PR that adds a resolver with an untested auth check → CI fails on branch coverage
- Run `/pre-review` on a branch with untested business logic → skill flags the gap
- Run `/test-api` for a new resolver → skill writes tests and confirms branch coverage meets threshold
