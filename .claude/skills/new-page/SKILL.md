---
description: Create a new page following all FarmStride conventions — layout choice (Tab vs FullScreen), header pattern, useAppNavigate, view/edit cascade, drawer editing, Apollo cache, accessibility labels, mobile styling.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# /new-page — Create a New Page

## Usage

- `/new-page <name>` — interactive (asks about layout type)
- `/new-page tab <name>` — TabLayout page (top-level, has bottom tab bar)
- `/new-page fullscreen <name>` — FullScreenLayout page (drill-in, no tab bar)

## Before Writing

Read these files to match current patterns:

- **TabLayout example**: `packages/web/src/pages/Horses.tsx` (list page with tab bar)
- **FullScreen example**: `packages/web/src/pages/SessionDetail.tsx` (detail page with back button, edit overlay)
- **Edit/create form**: `packages/web/src/pages/EditHorse.tsx` or `packages/web/src/pages/EditSession.tsx`
- **Navigation hook**: `packages/web/src/hooks/useAppNavigate.ts`
- **Layout components**: `packages/web/src/layouts/TabLayout.tsx`, `packages/web/src/layouts/FullScreenLayout.tsx`
- **Design doc**: `docs/design/navigation.md` (layout rules, view/edit cascade, drawer editing, animation)

## Steps

1. **Create component**: `packages/web/src/pages/<Name>.tsx` (PascalCase)
2. **Add route** in `packages/web/src/App.tsx` under the correct layout group
3. **Use `useAppNavigate`** — never raw `useNavigate`. Methods: `push` (forward), `back`, `backTo` (dismiss to route)

## Key Rules

- FullScreen pages: header with back button (`aria-label="Go back"`)
- View/edit cascade: edit overlay slides in from right (read `SessionDetail.tsx` for pattern)
- Drawer editing: SummaryRow + FieldEditSheet (read `docs/design/navigation.md`)
- Apollo cache: evict after mutations (see Cache Pattern below)
- Post-save: create → `backTo('/')`, edit overlay → close overlay, delete → `backTo('/')`
- Mobile: 44x44px touch targets, `pb-20` for tab bar padding, `min-h-dvh` for full screen
- Loading: explicit `loading` state from `useQuery` (no Suspense)
- Auth: handled by layout — don't check in page component

## Apollo Cache Pattern

All mutations use field-level eviction. Evict every cached query field that could contain stale data, then garbage collect:

```typescript
await createHorse({
    variables: { name, notes },
    update(cache) {
        cache.evict({ fieldName: 'horses' }); // list query
        cache.gc();
    },
});
```

For updates/deletes, evict both the list and detail fields:

```typescript
await updateHorse({
    variables: { id, name, notes, isActive },
    update(cache) {
        cache.evict({ fieldName: 'horses' }); // list
        cache.evict({ fieldName: 'horse' }); // detail
        cache.gc();
    },
});
```

Also evict related query fields. For example, session mutations also evict `lastSessionForHorse` since that query depends on session data:

```typescript
update(cache) {
    cache.evict({ fieldName: 'sessions' });
    cache.evict({ fieldName: 'lastSessionForHorse' });
    cache.gc();
}
```

**Rule of thumb**: if the mutation could change what any existing query returns, evict that query's field name.

## After Creating

```bash
pnpm run check  # verify types
```
