---
description: Mobile UX analysis for new features — thumb zone mapping, progressive disclosure, component state tables, touch targets, and bottom sheet patterns. Run before implementation.
allowed-tools: Read, Glob, Grep
---

# /mobile-ux — Mobile UX Design Analysis

## Usage

- `/mobile-ux <feature>` — analyze UX for a new feature before building it
- `/mobile-ux review <page>` — audit an existing page for mobile UX issues

## When to Use

Run this **before implementation** (step 0 of the New Feature Workflow). The output feeds into the design doc or issue description, not into code directly.

## Analysis Methodology

### 1. Page Context

Read the target page (or the page the feature will live on) to understand:

- Current layout type (TabLayout vs FullScreenLayout)
- Existing sections and their vertical ordering
- Scroll depth — how far down does content go?
- Fixed/floating elements (FABs, tab bars, headers)

### 2. Thumb Zone Mapping

Categorize interactive elements by reachability on a phone held one-handed:

| Zone     | Reach               | Where on screen | Use for                                |
| -------- | ------------------- | --------------- | -------------------------------------- |
| **Easy** | Natural thumb arc   | Bottom 40%      | Primary actions, frequent interactions |
| **OK**   | Stretch             | Middle 30%      | Secondary actions, content interaction |
| **Hard** | Requires hand shift | Top 30%         | Navigation (back button), rare actions |

**Rules:**

- Primary CTAs (Generate, Save, Analyze) belong in the Easy zone
- Destructive actions can be in Hard zone (intentional friction)
- If a feature adds interactive elements, map each one to a zone

### 3. Progressive Disclosure Audit

For any feature that shows AI-generated or complex content:

| Level       | What to show                    | Interaction             |
| ----------- | ------------------------------- | ----------------------- |
| **Glance**  | Headline or summary (1-2 lines) | None — visible on page  |
| **Scan**    | Key content (4-6 lines)         | Default collapsed state |
| **Read**    | Full content                    | "Show more" or scroll   |
| **Explore** | Related actions, settings       | Tap into drawer/sheet   |

**Rules:**

- Never show full AI output inline — always collapse with "Show more"
- Bottom sheets for anything requiring input (selection, forms)
- Keep the page scannable without expanding anything

### 4. Component State Table

Every interactive component needs all states defined **before** implementation:

| State        | Required?                  | What to show                                                |
| ------------ | -------------------------- | ----------------------------------------------------------- |
| Empty        | If data-dependent          | Friendly message + CTA to create data                       |
| Loading      | Always for async           | Skeleton matching content shape                             |
| Loaded       | Always                     | Primary content                                             |
| Error        | Always for async           | Message + retry action, preserve stale content if available |
| Stale        | If cached                  | Existing content + indicator + refresh action               |
| Rate limited | If AI-powered              | Clear message + when to retry                               |
| Disabled     | If conditionally available | Muted state + explanation why                               |

**Rules:**

- Skeleton shapes should match the loaded content layout (not a generic spinner)
- Errors should never lose existing content — show stale data + error toast
- Rate limit messages should say **when** the user can try again

### 5. Touch Target Audit

Verify every interactive element meets minimum sizes:

| Element       | Minimum size | FarmStride standard                  |
| ------------- | ------------ | ------------------------------------ |
| Buttons       | 44x44px      | `h-10 w-10` (icon) or `min-h-[44px]` |
| Chips/tags    | 44px height  | `h-11 px-4`                          |
| List rows     | 44px height  | `min-h-[52px]` with padding          |
| Close/dismiss | 44x44px      | Ghost button with icon               |

### 6. Bottom Sheet Patterns

If the feature uses a bottom sheet (`Sheet` with `side="bottom"`):

- **Max height:** `max-h-[85vh]` — leave header visible for orientation
- **Content overflow:** `overflow-auto` inside sheet body
- **Close affordances:** Drag handle + X button + tap outside
- **Focus trap:** Shadcn Sheet handles this automatically
- **Scroll within scroll:** Avoid if possible. If needed, use sticky headers inside the sheet.

## Output Format

After analysis, produce a summary with:

1. **Placement recommendation** — where on the page, which zone
2. **Disclosure strategy** — what's visible at each level
3. **State table** — all states for the new component(s)
4. **Touch target checklist** — any elements that need sizing attention
5. **Concerns** — anything that might cause problems on small screens

## Reference Files

- `docs/design/navigation.md` — layout rules, mobile conventions, accessibility
- `docs/design/ai-horse-intelligence.md` — example of this methodology applied
- `packages/web/src/pages/HorseProfile.tsx` — reference page with good mobile patterns
- `packages/web/src/components/ui/sheet.tsx` — bottom sheet component
- `packages/web/src/components/ui/skeleton.tsx` — loading states
