---
description: Implement a GitHub issue — fetch, plan, build with dev server, pause for manual verification, iterate on feedback, then commit.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Task, Skill, AskUserQuestion
---

# /gh-issue — GitHub Issue Workflow

## Usage

- `/gh-issue <number>` — implement GitHub issue by number
- `/gh-issue <url>` — implement GitHub issue by URL

**Prerequisite:** Launch Claude in a native worktree from the main checkout: `claude -w issue-<number>`. Root env files are copied in via `.worktreeinclude`; in a fresh worktree run `pnpm install && pnpm run env:local && pnpm --filter api exec prisma generate` (the `env:*` step recreates the `packages/api/.env` symlink, which isn't copied).

## Workflow

### 1. Verify branch and worktree

Check that the current environment matches the issue:

1. **Confirm we're NOT on main:**

    ```bash
    git branch --show-current
    ```

    If on `main` (i.e., running in the main checkout, not a worktree), halt — tell the user to relaunch with `claude -w issue-<number>`.

2. **Fetch the issue:**

    ```bash
    gh issue view <number_or_url> --json title,body,labels,comments,assignees
    ```

3. **Check the branch matches the issue.** A native worktree starts on an auto-generated branch like `worktree-issue-<number>` — confirm the number matches this issue, then rename it to the conventional form (label → prefix: `bug` → `fix/`, `documentation` → `docs/`, `chore`/`maintenance` → `chore/`, `refactor` → `refactor/`, otherwise `feat/`; slugify the title, lowercase hyphens, max ~40 chars):

    ```bash
    git branch -m <prefix><issue-number>-<slug>   # e.g. fix/42-login-crash
    ```

    If the branch is already a conventional name containing a different issue number, ask the user if they're in the right worktree before proceeding.

4. **Track the issue number** for statusline:

    ```bash
    printf "ISSUE=<issue_number>\n" > .state
    ```

5. **Set project board status to In Progress:**
    ```bash
    # Substitute the issue number as an integer, not a string
    ITEM_ID=$(gh project item-list 1 --owner taco --limit 100 --format json | python3 -c "
    import json, sys
    for item in json.load(sys.stdin)['items']:
        if item['content'].get('number') == <issue_number>:
            print(item['id']); break
    ")
    if [ -z "$ITEM_ID" ]; then echo "ERROR: issue not found in project"; fi
    # Status field: PVTSSF_lAHOACMj-84BRjUGzg_WM4I, "In Progress": 47fc9ee4
    gh project item-edit --project-id PVT_kwHOACMj-84BRjUG --id $ITEM_ID \
      --field-id PVTSSF_lAHOACMj-84BRjUGzg_WM4I --single-select-option-id 47fc9ee4
    ```

Display a summary: title, description, labels, and any relevant comments.

### 2. Explore & plan

- Use Explore agents (low effort) to understand the relevant code areas
- Use a Plan agent (high effort) to design the implementation
- Present the plan to the user with:
    - What files will be created/modified
        - Explain why for each and alternatives you considered
        - Highlight any potential risks to performance or security with these changes
    - Key design decisions
    - A **Skills** table mapping each step to the skill that will govern it (see CLAUDE.md Planning Convention)
    - Any open questions
- **Wait for user approval before proceeding**

### 3. Start dev server

Start `pnpm dev` in the background:

```bash
pnpm run dev
```

**Tell the user the exact port numbers** so they can open the app in their browser. Ports are dynamically allocated — check Vite and Fastify output for actual values.

### 4. Build

Implement the changes following project conventions (see CLAUDE.md). After making changes:

```bash
pnpm run format
```

The dev server (Vite HMR + tsx watch) picks up changes automatically.

### 5. Pause for manual verification

**Do NOT commit yet.** Ask the user to verify the changes in their browser:

> The dev server is running on port XXXX. Please test the changes and let me know if anything needs adjustment.

Wait for user feedback.

### 6. Iterate

Apply feedback, re-format, and ask the user to verify again. Repeat until they're satisfied.

### 7. Finalize

Once the user approves:

1. Run `/preflight` to check formatting + types
2. Run `/pre-review` for independent code review
3. Ask the user for final go-ahead to commit
4. Run `/commit` to create the commit
5. Ask if the user wants to push and create a PR

## Notes

- Never commit without explicit user approval
- Keep the dev server running throughout the session
- If the issue requires schema changes, use `/schema` skill first
- If the issue requires a new page, use `/new-page` skill for conventions
- Reference the issue number in the commit message: `fixes #<number>`
- When done, exit Claude — it offers to remove the worktree on exit (or run `git worktree remove <path>` from the main checkout later)
