# FarmStride E2E Testing Design Doc

> **Status**: Implemented. This doc captures the design decisions made. See README for usage.

## Overview

FarmStride needs automated testing to support confident iteration, CI/CD pipelines, and multi-contributor development (humans and AI agents working across branches). This document explores the problem space and recommends an approach for end-to-end testing.

---

## Problem Space

### Problem 1: No Automated Confidence

**Current state**: Changes are verified manually. A developer makes a change, runs the app locally, clicks through flows, and hopes they didn't break something.

**Pain points**:

- Manual testing is slow and inconsistent
- Regressions slip through, especially in flows you didn't think to check
- Refactoring is scary — no safety net

**Why this matters**: As FarmStride grows (AI features, more UI, production deployment), manual verification doesn't scale. For interview demos, a broken flow at the wrong moment is embarrassing.

### Problem 2: Multi-Contributor Isolation

**Current state**: One developer, one machine, one database.

**Emerging reality**: Travis wants to use AI agents for code contributions. Multiple branches may be in flight. CI pipelines will run tests on PRs.

**Pain points**:

- Tests hitting a shared database corrupt each other's state
- Branch A's test run pollutes Branch B's environment
- "Works on my machine" problems when dev and CI environments differ

**Why this matters**: Without isolation, tests become flaky and untrustworthy. Flaky tests are worse than no tests — they train you to ignore failures.

### Problem 3: Feedback Speed

**Current state**: No automated tests means no feedback loop.

**Future risk**: Slow tests discourage running them. If CI takes 10 minutes, developers skip local runs and push directly. Test failures become someone else's problem.

**Why this matters**: Fast feedback keeps tests valuable. If you find out about a break in 30 seconds vs. 10 minutes, you're still in context and can fix it immediately.

### Problem 4: What to Test

**Current state**: No tests, so no decisions made yet.

**Tension**: Unit tests are fast but test implementation details. Integration tests are realistic but slower. E2E tests catch real bugs but are slowest and most brittle.

**Why this matters for FarmStride**: The API resolvers are thin — mostly Prisma calls. The real complexity is in the integration: does the web app talk to the API correctly? Does the API talk to the database correctly? Does auth flow end-to-end?

---

## Goals

1. **Catch real bugs** — Tests should fail when user-facing behavior breaks, not when implementation details change.

2. **Fast feedback** — Local test runs should complete in under 60 seconds for the common case.

3. **CI/local parity** — The same command should work identically on a developer machine and in GitHub Actions.

4. **Branch isolation** — Concurrent test runs (different branches, different agents) must not interfere with each other.

5. **Low maintenance** — Tests should be easy to write, easy to debug, and not require constant fixing due to brittleness.

---

## Non-Goals (For Now)

- **Visual regression testing** — Useful but adds complexity; revisit post-launch
- **Performance testing** — Not meaningful at current scale
- **Mobile native testing** — Web-only for now; PWA tested via browser emulation
- **API contract testing** — Only one consumer (web app); E2E covers this implicitly

---

## Decision 1: Test Framework

### Option A: Playwright

**What it is**: Microsoft's browser automation library. Focuses on web testing with native async/await API.

**Pros**:

- Fast: parallel execution by default, lightweight browser contexts
- Multi-browser: Chromium, Firefox, WebKit all first-class
- Modern API: async/await, no chaining quirks
- Good mobile emulation for viewport/touch testing
- Built-in API testing via `request` fixture (useful for setup/teardown)
- Trace viewer for debugging failures
- Active development, fast-moving

**Cons**:

- Smaller community than Cypress (fewer blog posts, plugins)
- Debugging experience is good but not as polished as Cypress time-travel
- Younger project — some rough edges in docs

**Best for**: Teams comfortable with async JS, prioritizing speed, testing modern web apps.

### Option B: Cypress

**What it is**: Purpose-built E2E testing framework with its own test runner and debugging UI.

**Pros**:

- Excellent time-travel debugger — see DOM state at each step
- Large community, extensive plugin ecosystem
- Cypress Cloud for CI parallelization and dashboards
- Gentle learning curve, good docs
- Mature and battle-tested

**Cons**:

- Slower: single-threaded by default, parallelization requires paid Cloud or workarounds
- Quirky async model: command chaining, not real promises
- WebKit support is experimental
- Heavier architecture (Electron-based runner)

**Best for**: Teams new to E2E testing, prioritizing debugging experience, willing to pay for Cloud features.

### Option C: Selenium/WebDriver

**What it is**: The original browser automation protocol. Many language bindings available.

**Pros**:

- Extremely mature, wide language support
- Works with any browser that implements WebDriver

**Cons**:

- Verbose, lower-level API
- Slower than modern alternatives
- More setup complexity
- Feels dated compared to Playwright/Cypress

**Best for**: Legacy projects, teams with existing Selenium infrastructure, non-JS stacks.

### Recommendation: Playwright

**Rationale**:

- Speed is a stated priority; Playwright's parallelism wins here
- Mobile-first app benefits from Playwright's device emulation
- Travis is comfortable with async/await; Cypress chaining would be friction
- Future WebSocket testing for agent features is cleaner in Playwright
- No existing investment in either tool, so no migration cost

**Trade-off acknowledged**: Giving up Cypress's superior debugger. Mitigation: Playwright's trace viewer is adequate, and writing focused tests reduces debugging need.

---

## Decision 2: Database Isolation Strategy

### Option A: Docker Container Per Run

**How it works**: Spin up a fresh Postgres container for each test run. Run migrations, seed, execute tests, destroy container.

```
Test run starts
  → docker-compose up (Postgres)
  → prisma migrate deploy
  → seed baseline data
  → run tests
  → docker-compose down
Test run ends (container gone, nothing persists)
```

**Pros**:

- Perfect isolation: each run is a fresh universe
- No cleanup logic needed: container death is cleanup
- Works identically local and CI
- No risk of state leakage between runs

**Cons**:

- Container startup adds ~5-10 seconds to each run
- Requires Docker on all dev machines and CI
- Slightly more complex setup

### Option B: Unique Database Per Run

**How it works**: Connect to a shared Postgres instance, create a uniquely-named database (`herdbook_test_{branch}_{timestamp}`), run tests, drop database.

```
Test run starts
  → CREATE DATABASE herdbook_test_main_1704825600
  → prisma migrate deploy
  → seed baseline data
  → run tests
  → DROP DATABASE herdbook_test_main_1704825600
Test run ends
```

**Pros**:

- Faster startup (no container boot)
- Works with existing local Postgres
- Lighter resource usage

**Cons**:

- Requires a running Postgres somewhere (dev machine or shared server)
- Orphaned databases if cleanup fails (need periodic garbage collection)
- CI needs a Postgres instance (service container or external)
- Potential connection limits on shared Postgres

### Option C: Shared Test Database with Transactional Rollback

**How it works**: One test database, each test runs in a transaction that rolls back. No data persists between tests.

**Pros**:

- Extremely fast (no setup/teardown)
- Simple concept

**Cons**:

- Doesn't work for E2E: browser and API server can't share a transaction
- Only viable for API-level integration tests
- Not applicable here

### Option D: Shared Test Database with Truncate Between Tests

**How it works**: One test database, truncate all tables between tests (or test suites).

**Pros**:

- Faster than recreating DB each time
- Simpler than Docker

**Cons**:

- Truncate order matters (foreign keys)
- Risk of flakiness if truncation misses something
- Still need isolation between concurrent runs (doesn't solve multi-branch problem)

### Recommendation: Docker Container Per Run (Option A)

**Rationale**:

- Multi-branch and multi-agent isolation is a stated requirement; Docker provides this cleanly
- 5-10 second startup is acceptable given total test runtime will be 30-60 seconds
- Docker is already in use for local Postgres dev environment
- GitHub Actions has excellent Docker support
- Eliminates entire class of "state leaked between runs" bugs

**Trade-off acknowledged**: Slower than Options B/D. Mitigation: Test suite is small; startup overhead is amortized. If tests grow to hundreds, revisit.

---

## Decision 3: Seeding Strategy

### Option A: Fresh Seed Per Test

**How it works**: Before each test, reset database to known state (truncate + seed).

**Pros**:

- Perfect isolation: tests cannot affect each other
- Any test can run independently

**Cons**:

- Slow: migration + seed per test adds seconds each
- With 20 tests, adds 40-100 seconds to suite

### Option B: Seed Once Per Suite

**How it works**: Before test suite, seed baseline data (horses, riders). Tests create their own specific data as needed. No cleanup between tests.

```
Suite starts
  → Seed: 3 horses, 2 riders (no sessions)
  → Test 1: creates a session, asserts on it
  → Test 2: creates a different session, asserts on it
  → Test 3: logs in, sees sessions from tests 1 & 2 in feed
Suite ends (container dies)
```

**Pros**:

- Fast: one seed operation, ~1-2 seconds
- Tests can build on each other's state (useful for stateful flows)
- Simple mental model

**Cons**:

- Test order can matter (Test 3 sees Test 1 & 2's data)
- Harder to run single test in isolation
- Debugging failures requires understanding accumulated state

### Option C: Seed Per Test File (Grouped)

**How it works**: Group related tests into files. Each file gets a fresh seed. Tests within a file share state.

```
auth.spec.ts:
  → Fresh seed
  → Test: signup works
  → Test: login works
  → Test: bad password fails

sessions.spec.ts:
  → Fresh seed
  → Test: can log a session
  → Test: session appears in feed
  → Test: session shows correct horse context
```

**Pros**:

- Balance of isolation and speed
- Related tests share appropriate state
- Each file is debuggable in isolation

**Cons**:

- More complex setup (per-file hooks)
- Need to decide how to group tests

### Recommendation: Seed Once Per Suite, with Escape Hatch (Option B, pragmatic)

**Rationale**:

- Test count will be small (~10-20 tests initially); full isolation overkill
- Docker container per run already provides cross-run isolation
- Simpler setup, faster iteration
- Tests creating their own data makes them self-documenting

**Escape hatch**: If test interdependence becomes painful, refactor to per-file seeding (Option C). Playwright's `beforeAll` per file makes this easy.

**Discipline required**: Tests should create the data they need rather than depending on seed data. Seed is just baseline (horses exist, riders can log in), not test-specific state.

---

## Decision 4: What to Test

### Philosophy: Test User Flows, Not Implementation

Given that FarmStride's value is in integration (web → API → DB), tests should exercise the full stack through user-visible behavior.

### Critical Paths (Must Test)

| Flow                            | Why Critical                               |
| ------------------------------- | ------------------------------------------ |
| Signup → lands on dashboard     | Core onboarding; breaks = no new users     |
| Login → lands on dashboard      | Core access; breaks = no one can use app   |
| Log session → appears in feed   | Core value prop; breaks = app is useless   |
| View session with horse context | Handoff value; breaks = core mission fails |

### Secondary Paths (Should Test)

| Flow                            | Why Important  |
| ------------------------------- | -------------- |
| Bad credentials → error message | Security + UX  |
| Duplicate email signup → error  | Data integrity |
| Log session with all work types | Enum coverage  |
| Empty state (no sessions)       | Edge case UX   |

### Not Worth E2E Testing (For Now)

| Thing                 | Why Skip                                        |
| --------------------- | ----------------------------------------------- |
| Every form validation | Test one representative case; trust the pattern |
| CSS/styling           | Not testing visual regression yet               |
| Error boundaries      | Would need to force errors; low ROI             |

### Test File Organization

```
packages/e2e/
  tests/
    auth.spec.ts          # signup, login, logout, bad credentials
    sessions.spec.ts      # log session, view feed, horse context
    navigation.spec.ts    # basic routing, mobile menu (if any)
```

---

## Decision 5: CI Integration

### Option A: GitHub Actions with Service Container

**How it works**: GitHub Actions spins up Postgres as a service container. Tests run against it.

```yaml
services:
    postgres:
        image: postgres:15
        env:
            POSTGRES_PASSWORD: test
        ports:
            - 5432:5432
```

**Pros**:

- Simple GitHub Actions config
- Fast startup (service containers are cached)
- No Docker-in-Docker complexity

**Cons**:

- Different setup than local (local uses docker-compose, CI uses service container)
- Harder to replicate CI environment locally

### Option B: Docker Compose in CI

**How it works**: CI runs the same `docker-compose.test.yml` that developers run locally.

```yaml
steps:
    - run: docker-compose -f docker-compose.test.yml up -d
    - run: pnpm test:e2e
    - run: docker-compose -f docker-compose.test.yml down
```

**Pros**:

- Identical setup local and CI
- Easier to debug CI failures locally
- One configuration to maintain

**Cons**:

- Docker-in-Docker can be finicky
- Slightly slower than service containers

### Recommendation: Docker Compose in CI (Option B)

**Rationale**:

- CI/local parity is a stated goal
- "Same command everywhere" reduces confusion
- Docker-in-Docker issues are solvable and well-documented for GitHub Actions

---

## Implementation Plan

### Phase 1: Foundation ✅

- [x] Create `packages/e2e` directory structure
- [x] Install Playwright, configure for Chromium + mobile viewport
- [x] Create `docker-compose.test.yml` for test Postgres
- [x] Write global setup: start containers, run migrations, seed
- [x] Write global teardown: stop containers
- [x] Verify: `pnpm test:e2e` works locally

### Phase 2: First Tests ✅

- [x] Auth tests: login flow
- [x] Session tests: log session, view in feed
- [x] Verify tests pass locally

### Phase 3: CI Integration ✅

- [x] Create `.github/workflows/e2e.yml`
- [x] Configure Docker Compose in Actions
- [x] Run on PR and push to main
- [x] Upload Playwright report as artifact

### Phase 4: Polish (In Progress)

- [x] Add test for horse context on session form
- [ ] Add test for empty states
- [ ] Add signup flow test
- [ ] Document: how to write new tests, how to debug failures
- [ ] Consider: parallelization if suite grows slow

---

## Open Questions

1. **Test data factories**: Should we build helpers like `createTestRider()`, `createTestSession()`? Or keep tests explicit with raw API calls? Factories are DRYer but hide what tests actually do.

2. **Authentication in tests**: Log in via UI every test? Or seed a valid token and inject it? UI login is realistic but slow; token injection is fast but skips auth flow.

3. **API as escape hatch**: Should tests ever call the GraphQL API directly (for setup or assertions), or always go through the UI? Direct API is faster and more precise; UI-only is more realistic.

4. **Flaky test policy**: What do we do when a test flakes? Quarantine? Retry? Fix immediately? Need a policy before it becomes a problem.

---

## Appendix: Technology Comparison Matrix

| Criterion            | Playwright | Cypress |
| -------------------- | ---------- | ------- |
| Execution speed      | ★★★★★      | ★★★☆☆   |
| Debugging experience | ★★★★☆      | ★★★★★   |
| Learning curve       | ★★★★☆      | ★★★★★   |
| Mobile emulation     | ★★★★★      | ★★★☆☆   |
| Multi-browser        | ★★★★★      | ★★★☆☆   |
| Community/ecosystem  | ★★★☆☆      | ★★★★★   |
| WebSocket support    | ★★★★★      | ★★★☆☆   |
| API testing built-in | ★★★★★      | ★★★★☆   |
| CI integration       | ★★★★★      | ★★★★☆   |

---

## Appendix: Example Test Structure

```typescript
// tests/sessions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Session Management', () => {
    test.beforeEach(async ({ page }) => {
        // Login before each test
        await page.goto('/login');
        await page.fill('[name="email"]', 'test@example.com');
        await page.fill('[name="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');
    });

    test('can log a new session', async ({ page }) => {
        await page.click('text=Log Session');
        await page.waitForURL('/sessions/new');

        // Select horse
        await page.selectOption('[name="horse"]', 'beau-123');

        // Fill form
        await page.fill('[name="duration"]', '45');
        await page.selectOption('[name="workType"]', 'FLATWORK');
        await page.fill('[name="notes"]', 'Worked on canter transitions');

        // Submit
        await page.click('button[type="submit"]');

        // Verify redirect and session appears
        await page.waitForURL('/dashboard');
        await expect(
            page.locator('text=Worked on canter transitions')
        ).toBeVisible();
    });

    test('shows horse context when selecting horse', async ({ page }) => {
        // Precondition: there's a previous session for this horse
        // (created in seed or earlier test)

        await page.click('text=Log Session');
        await page.selectOption('[name="horse"]', 'beau-123');

        // Should show last session context
        await expect(
            page.locator('[data-testid="last-session-context"]')
        ).toBeVisible();
        await expect(
            page.locator('[data-testid="last-session-context"]')
        ).toContainText('Last session');
    });
});
```
