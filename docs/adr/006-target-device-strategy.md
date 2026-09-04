# ADR 006: Target Device Strategy

**Status:** Accepted
**Date:** 2026-03-12

## Context

FarmStride is a barn management tool used primarily at the barn — logging sessions while standing in the arena, checking a horse's history from the grooming stall, reviewing a rider's progress between lessons. This context is overwhelmingly mobile: phones in pockets, often one-handed, sometimes with gloves.

We had to decide whether to build a responsive app (mobile + desktop) or commit to mobile-only. This isn't just a CSS question — it affects component design, navigation architecture, testing strategy, and the features we build.

## Decision

**Mobile-only. No desktop breakpoints.** The app is designed for phone-sized viewports (360-428px width) and does not adapt to larger screens. On a desktop browser, it renders at phone width — usable but not optimized.

### What this means concretely

**Layout and navigation.** Two layout types — tab bar (bottom navigation for primary sections) and full-screen (drill-in pages that slide over the tab bar). No sidebar, no multi-column layouts, no hover states for navigation. The tab bar uses 5 fixed tabs with a center action button.

**Touch targets.** Minimum 44x44px for all interactive elements (Apple HIG guideline). No small links, icon-only buttons without adequate hit areas, or click targets that assume mouse precision.

**CSS.** Tailwind classes use mobile values directly — no `md:`, `lg:`, or `xl:` breakpoints. Safe area insets (`env(safe-area-inset-bottom)`) handle notches and home indicators. `min-h-dvh` (dynamic viewport height) handles mobile browser chrome.

**PWA mode.** The app supports `display-mode: standalone` (add to home screen) with CSS adjustments for the different viewport behavior in fullscreen mode.

**E2E testing.** Smoke tests (CI on every PR) run on Pixel 5 / Chromium. The full regression suite adds iPhone 12 / WebKit. No desktop viewport tests exist or are planned.

**View Transitions API.** Page transitions use `document.startViewTransition()` for native-feeling slide animations. This API is designed for the kind of sequential navigation mobile apps use (push/pop), not the parallel panel layouts common on desktop.

### Why not "mobile-first responsive"

Mobile-first responsive (design for mobile, add desktop breakpoints) is the industry default. We chose to skip the desktop breakpoints entirely because:

1. **Reduced surface area.** Every responsive breakpoint is code that needs testing, reviewing, and maintaining. With mobile-only, there's one layout to get right, one set of spacing values, one navigation pattern. The codebase is roughly half the CSS it would be with desktop support.
2. **Focused UX decisions.** Responsive design often compromises both sizes — hamburger menus that are awkward on desktop, sidebars that collapse poorly on mobile. Mobile-only means every interaction is designed for the actual use context.
3. **Testing confidence.** E2E tests on two mobile viewports cover the real usage. Adding desktop viewports would double the test matrix for a context that doesn't match how the app is used.
4. **Product scope.** The app is in early development. If desktop becomes necessary (e.g., barn managers doing bulk data entry), it's a deliberate expansion, not a default we maintain from day one.

## Alternatives considered

**Mobile-first responsive.** Build for mobile, add `md:` and `lg:` breakpoints for desktop. The standard approach. Rejected because it doubles the design and testing surface for a use case that doesn't exist yet. Every component would need two layouts, and the desktop layout would be speculative (we don't know what barn managers want on desktop).

**Desktop-first, then mobile.** Design for desktop and adapt down. Common in enterprise SaaS. Rejected because the primary use context is a phone at a barn, and desktop-first tends to produce mobile experiences that feel like afterthoughts — tiny buttons, hover-dependent interactions, horizontal scrolling.

**Responsive with a desktop "wrapper."** Mobile layout centered in a desktop-width container with decorative padding. Used by apps like Instagram Web. Low effort but also low value — it doesn't make desktop better, just less awkward. If desktop becomes a real use case, it deserves its own design, not a mobile layout in a box.

**Native mobile app (React Native / Flutter).** Native would give better performance, offline support, and platform integration (camera, notifications). Rejected because: web is faster to iterate on during early development, the team's expertise is web, and a PWA covers the "add to home screen" use case. If offline support or native hardware integration becomes critical, this alternative becomes more attractive.

## Consequences

- The app looks like a phone app on desktop. This is acceptable — desktop isn't the use case.
- No responsive utility classes (`md:`, `lg:`, etc.) in the codebase. If desktop support is added later, it's a deliberate project with its own design work, not a gradual accumulation of breakpoints.
- Component design can assume narrow viewports. Full-width cards, stacked layouts, and bottom sheets are the default patterns. No need for grid systems or column logic.
- E2E tests only cover mobile viewports. A desktop bug would not be caught by automated testing.
- Adding desktop support later is an expansion, not a refactor. The mobile design is a complete product, not a half of a responsive one. Desktop would likely need its own layout system, navigation (sidebar instead of tab bar), and component variants.
