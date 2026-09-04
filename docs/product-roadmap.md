# FarmStride Product Roadmap

_March 2026_

## Guiding Principles

1. **Real users first** — Deploy early, get feedback from actual riders. Polish follows validation.
2. **Define work when it's next** — Future features stay loose. Detail comes with context.
3. **Production thinking at small scale** — Architecture that could scale, but built for one barn.
4. **AI as training companion** — Not a bolt-on demo. AI earns its place by helping riders train better.

---

## What's Built

The core loop works: **Record session (voice or manual) -> Track per horse -> View activity feed**

| Feature                                                  | Status   |
| -------------------------------------------------------- | -------- |
| Auth (login/signup, JWT, rate limiting, email allowlist) | Complete |
| Barn multi-tenancy (barn model, invite codes, roles)     | Complete |
| Horse CRUD (create, edit, soft-delete)                   | Complete |
| Session CRUD (create, edit, delete)                      | Complete |
| Manual session entry with form persistence               | Complete |
| Voice session capture (Whisper + GPT-5.2)                | Complete |
| Field-level voice-to-text (notes)                        | Complete |
| Dashboard with recent activity feed                      | Complete |
| Horse profile with 12-week heatmap and session history   | Complete |
| Session filtering (horse, work type, date range)         | Complete |
| Session detail with view/edit cascade                    | Complete |
| Mobile navigation (bottom tab bar, view transitions)     | Complete |
| Previous session context on new entry                    | Complete |
| Security hardening (rate limiting, CORS, JWT expiry)     | Complete |
| N+1 resolution (DataLoader pattern)                      | Complete |
| AI horse training summaries (GPT-5-mini)                 | Complete |
| Versioned prompt registry                                | Complete |
| Unified AI rate limiting (GraphQL + REST)                | Complete |
| Error telemetry (Sentry, API + web)                      | Complete |
| E2E tests (auth, nav, horses, sessions)                  | Complete |
| Deployed to production (Railway + Neon)                  | Complete |

### Differentiator

Voice-to-text session parsing is the standout feature. It solves a real problem: logging sessions at the barn with dirty or gloved hands. The AI handles fuzzy horse name matching, natural language dates ("yesterday morning"), duration parsing ("an hour and a half"), and work type inference from context.

---

## The Gap

**"I logged sessions... now what?"**

Riders can't answer:

- "What did we work on last time? What did Sarah work on with this horse?"
- "How is shoulder-in progressing — is it getting easier?"
- "Am I riding consistently enough?"
- "What should I focus on next ride?"

Data goes in but can't be meaningfully retrieved or acted on. The core problem is twofold: the data isn't visible enough (no stats, no trends), and the data isn't structured enough (free-text notes contain rich training detail that's locked in prose).

---

## What's Next

The next work follows a single arc: **make logged data visible, then structured, then actionable.** The enrichment pipeline is the validated foundation that connects all three layers.

### Layer 1: Make the data visible

Quick wins that give riders a reason to come back and review. No schema changes needed.

- **Horse profile improvements** — At-a-glance chips, 14-day chart, training frequency stats. See [design-horse-profile-redesign.md](design-horse-profile-redesign.md).
- **Session rating in activity cards** — Surface the rating field in the feed so riders can scan quality at a glance.
- **Calendar view** — Equestrians think in weeks. Show which days had sessions, for which horses.

### Layer 2: Make the data structured — the enrichment pipeline

This is the foundation. Free-text session notes contain rich training detail — movements worked, quality signals, physical observations, progression — but it's locked in prose. The enrichment pipeline extracts structured metadata from notes at save time, making that data queryable and actionable.

**Validated.** Ran the extraction prompt against all 20 production sessions. Results: 21 unique canonical movement names, accurate physical observation capture, reliable progression signal detection, graceful degradation on thin notes. Cost: ~$0.002/session on gpt-4o-mini.

The pipeline enables:

- **Handoff context** — "Luna lately: Sarah rode her Saturday, focused on canter transitions. She was stiff tracking right." This is the north star feature: when a rider selects a horse, they see a synthesized view of recent activity from all riders. Not just a session list — a concise summary of what's been happening.
- **Movement progression view** — For a given horse, show the quality arc of a specific skill over time, in the rider's own words. "Shoulder-in: struggled → needed work → coming easily in warmup."
- **Horse workload & variety view** — Work type distribution, rider distribution, gap detection. Richer than heatmaps because it draws on enriched metadata.

Schema change: `aiMetadata` JSONB column on Session, with `confirmed` boolean and optional `confirmedAt` timestamp.

### Layer 3: Make the data actionable — AI as training guide

This is where FarmStride becomes a training companion. Each feature builds on the enrichment data.

- **Pre-ride briefing** — When starting a session, show handoff context plus the rider's own history. Present the AI extraction for confirmation ("Sounds like you worked on X — right?"). One tap to confirm, raising data confidence for downstream features.
- **Consolidation nudges** — "Shoulder-in has been coming easily for the last three weeks. Thinking about what to introduce next?" Question-based, not prescriptive.
- **Adaptive weekly check-in** — Periodic reflection prompt that adapts to engagement level. Active riders get light summaries. Quiet riders get catch-up context.
- **Next-ride suggestions** — Synthesizes movement lifecycle, recent history, and workload balance into a grounded suggestion. The capstone feature — only viable after trust in the data layer is established.

### Later: Quality of life & growth

Driven by real user friction, not pre-planned.

| Feature           | Trigger                            |
| ----------------- | ---------------------------------- |
| Google SSO        | If password login becomes annoying |
| Rider invitations | If adding barn members is needed   |
| Media attachments | If riders want photos/videos       |
| Data export (CSV) | If users ask for it                |

---

## Deprioritized (Intentionally)

- **Desktop support** — Mobile-at-the-barn is the right context
- **Offline mode** — Hard to build, most barns have cell service
- **Multi-agent orchestration** — Engineering showcase without product value at this scale
- **Agent infrastructure as a standalone milestone** — Build infra when a specific feature needs it

---

## Data Model Outlook

| Layer                 | Schema changes                                                   |
| --------------------- | ---------------------------------------------------------------- |
| 1 (data visibility)   | None — new queries and frontend                                  |
| 2 (enrichment)        | `aiMetadata` JSONB on Session, `confirmed`, `confirmedAt`        |
| 2 (summaries)         | `summaryContent`, `summaryGeneratedAt` on Horse (shipped)        |
| 3 (goal planning)     | `goals` table: horse, target date, description, discipline/level |
| 3 (progress tracking) | Links between goals, plans, and sessions                         |

---

## Resolved Questions

1. **Multi-tenancy**: Barn model with invite codes and trainer/rider roles. Data scoped to barn.
2. **Public signup**: Disabled. Invite code required. Revisit if adding Google SSO.
3. **JWT expiry**: 30 days. No refresh token needed at this scale.
4. **AI approach**: Product-first. Build the simplest thing that works at each step.
5. **Enrichment pipeline viability**: Validated against real data. Prompt-level normalization produces queryable movement names without a vocabulary table.

## Open Questions

1. **AI cost management** — Probably irrelevant for one barn, but worth monitoring once enrichment and suggestions are live.
2. **Extraction confirmation rate** — Will riders confirm AI extractions? At what rate do coaching features become viable with unconfirmed data?
3. **Goal UX** — Standalone goal entry form, or conversational ("tell the AI what you're training for")?
