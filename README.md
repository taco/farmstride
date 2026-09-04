# FarmStride

[![E2E Nightly](https://github.com/taco/herdbook/actions/workflows/e2e-nightly.yml/badge.svg)](https://github.com/taco/herdbook/actions/workflows/e2e-nightly.yml)

A mobile-first training journal for equestrians. Log riding sessions by voice or form, track activity per horse, and review training patterns over time.

Deployed to production on Railway + Neon Postgres, used by real riders at a small barn. Built for phones — riders log sessions with dirty or gloved hands, so voice-first capture is a core feature, not a demo.

## Features

**AI-powered**

- **Voice session capture** — Speak naturally ("rode Luna for an hour, worked on canter transitions, she was stiff to the right"). Whisper transcribes, GPT-5.2 extracts structured fields (horse, duration, work type) and organizes the transcript into clean training notes. Horse names are resolved from context via the LLM — handles partial names and nicknames.
- **Training summaries** — AI-generated per-horse summaries that synthesize session history into workload signals, focus areas, and narrative insight. Versioned prompt registry with configurable models.

**Core loop**

- Manual session entry with draft saving and field-level voice input
- Per-horse activity heatmaps (12-week view)
- Dashboard with recent activity feed
- Barn multi-tenancy — invite codes, trainer/rider roles, shared horse roster
- Horse and rider profiles with archive support
- Invite-only signup with JWT auth

## Architecture

React SPA → Fastify GraphQL API → PostgreSQL. AI features call OpenAI (Whisper + GPT) from the API server. Organized as a pnpm monorepo with three packages: `api`, `web`, and `e2e`.

| What                   | Where                                                                         | Why it's interesting                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice parsing pipeline | [`api/src/rest/parseSession.ts`](packages/api/src/rest/parseSession.ts)       | Whisper transcription → structured extraction via JSON Schema. LLM resolves horse/rider names from context, infers work type, parses duration. |
| Prompt registry        | [`api/src/prompts/`](packages/api/src/prompts/)                               | Versioned prompt configs with model resolution from env vars. Each prompt is a typed config object, not a string.                              |
| Training summaries     | [`api/src/rest/generateSummary.ts`](packages/api/src/rest/generateSummary.ts) | Computes workload signals from session history, feeds them to an LLM for narrative synthesis. Validates and caches output.                     |
| AI rate limiting       | [`api/src/rest/utils/`](packages/api/src/rest/utils/)                         | Per-user burst + daily rate limiters shared across all AI endpoints. Prevents runaway costs.                                                   |
| GraphQL + DataLoader   | [`api/src/graphql/`](packages/api/src/graphql/)                               | Schema-first GraphQL with Prisma resolvers and DataLoader for N+1 resolution.                                                                  |
| Navigation system      | [`web/src/hooks/useAppNavigate`](packages/web/src/hooks/useAppNavigate.ts)    | View Transitions API for native-feeling page animations. Two layout types: tab bar and full-screen overlay.                                    |
| E2E test tiers         | [`e2e/tests/`](packages/e2e/tests/)                                           | Smoke (auth, nav) runs on PRs. Full regression (Pixel 5 + iPhone 12) runs on main and nightly cron.                                            |

## Engineering Decisions

Key architectural choices are documented as [ADRs](docs/adr/) — each covers the problem, the decision, alternatives considered, and consequences.

| Decision                                                                         | Core trade-off                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [GraphQL Data-Fetching Strategy](docs/adr/001-graphql-data-fetching.md)          | Uniform DataLoaders everywhere vs. optimizing per-resolver — why we batch even when N=1           |
| [GraphQL Authorization Strategy](docs/adr/002-graphql-authorization-strategy.md) | Deny-all schema transformer vs. per-resolver auth checks — making "forgot to add auth" impossible |
| [Multi-Tenant Data Isolation](docs/adr/003-multi-tenant-data-isolation.md)       | Postgres RLS vs. application-level filtering — why the database is the last line of defense       |
| [AI Feature Architecture](docs/adr/004-ai-feature-architecture.md)               | Prompt registry + model tiers + rate limiting — cost discipline for LLM features                  |
| [API Protocol Boundary](docs/adr/005-api-protocol-boundary.md)                   | GraphQL for data, REST for AI pipelines — when to break the "one API style" rule                  |
| [Target Device Strategy](docs/adr/006-target-device-strategy.md)                 | Mobile-only vs. responsive — why skipping desktop halves the engineering surface                  |

## Tech Stack

| Layer   | Stack                                                        |
| ------- | ------------------------------------------------------------ |
| API     | Fastify, GraphQL, Prisma, PostgreSQL (Neon), TypeScript      |
| Web     | React, Vite, Apollo Client, Tailwind + Shadcn UI, TypeScript |
| Testing | Vitest, Playwright, Docker (isolated test Postgres)          |
| Infra   | Railway (hosting), Neon (database branching), GitHub Actions |
| Ops     | Sentry (error + performance tracing, API + web)              |

<details>
<summary><strong>Development Setup</strong></summary>

### Getting Started

**Prerequisites**: Node.js (see `.node-version`), pnpm 10.4+, PostgreSQL

```bash
cp packages/api/.env.example .env.api.local  # Add DATABASE_URL, JWT_SECRET, OPENAI_API_KEY
pnpm env:local                # Point API at local database
pnpm run init                 # Install deps + generate Prisma client
pnpm --filter api run prisma:migrate  # Run migrations
pnpm dev                      # Start API (port 4000) + Web (port 5173)
```

### Testing

```bash
pnpm run test       # Unit/integration tests (Vitest)
pnpm run test:e2e   # Full E2E suite (spins up Docker Postgres, runs Playwright)
pnpm run check      # Format check + typecheck (also runs as pre-commit hook)
```

E2E tests are split into **smoke** (fast, PR-blocking) and **regression** (full feature coverage, runs on main + nightly). Docker must be running — the test harness handles container lifecycle automatically.

### Environment Management

Environment config lives at the repo root as `.env.api.*` files (gitignored), symlinked into `packages/api/.env`:

```bash
pnpm env:local      # Local PostgreSQL (default)
pnpm env:neon-dev   # Neon dev branch (child of production)
pnpm env:neon-prod  # Neon production
pnpm env:status     # Check which env is active
```

| Variable               | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                              |
| `JWT_SECRET`           | Secret for signing JWTs (32+ chars in production)         |
| `OPENAI_API_KEY`       | Required for voice capture and AI summaries               |
| `HONEYCOMB_API_KEY`    | Optional. Enables OpenTelemetry tracing to Honeycomb      |
| `HONEYCOMB_CONFIG_KEY` | Optional. Lets Railway deploys drop a marker in Honeycomb |

### Project Structure

```
herdbook/
├── packages/
│   ├── api/              # GraphQL API server
│   │   ├── prisma/       # Schema and migrations
│   │   └── src/
│   │       ├── graphql/  # Schema, resolvers, loaders
│   │       ├── prompts/  # AI prompt registry (versioned)
│   │       ├── rest/     # REST endpoints (voice, summaries)
│   │       └── middleware/
│   ├── web/              # React frontend (mobile-only)
│   │   └── src/
│   │       ├── pages/
│   │       ├── layouts/  # TabLayout, FullScreenLayout
│   │       └── components/
│   └── e2e/              # Playwright tests (smoke + regression)
├── docs/
│   ├── adr/              # Architecture decision records
│   └── design/           # Feature design docs
└── scripts/              # Dev tooling
```

</details>

## License

[MIT](LICENSE)
