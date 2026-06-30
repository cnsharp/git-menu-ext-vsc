# Git Menu Ext

VS Code extension that adds extra Git actions for branch management, commit operations, and file export.

## Features

### Copy Branch Name

Copies the current branch name to clipboard.

**Location:** Status bar copy button (next to branch name)

---

### Delete Branches

Deletes local branches matching a keyword. Optionally deletes matching remote branches as well.

**Location:** Command Palette → `Git: Delete Branches...`, or Source Control menu

1. Enter a keyword (e.g. `release-`)
2. Choose whether to also delete remote branches
3. Review the list of matched branches
4. Confirm to delete

The current branch is always skipped. All matched branches are force-deleted (`-D`).

---

### Delete Outdated Branches

Lists and deletes local branches whose remote tracking branch is gone.

**Location:** Command Palette → `Git: Delete Outdated Branches...`, or Source Control menu

1. The extension scans `git branch -vv` for branches with remote marked as `gone`
2. A multi-select list shows the candidates (branches not fully merged are marked with a warning icon)
3. Select branches to delete and confirm
   - Fully merged branches are deleted with `-d`
   - Unmerged branches are deleted with `-D`

---

### Squash Commits

Squash multiple recent commits into one.

**Location:** Command Palette → `Git: Squash Commits...`, or Source Control menu

1. Select a target commit from recent history — it and all commits above it up to HEAD will be squashed
2. Edit the commit message (pre-filled with deduplicated messages from all squashed commits)
3. Confirm to squash

---

### Export Changed Files

Exports all files changed between two commits.

**Location:** Command Palette → `Git: Export Changed Files...`, or Source Control menu

1. Select an older commit from recent history
2. Select a newer commit
3. Configure:
   - **File extensions**: filter by extension (e.g. `vue ts js`), leave empty for all files
   - **Output directory**: where to export
   - **Export as zip**: pack into a zip archive, or copy as a directory tree
4. The output is named `{project}-{oldestHash}-{newestHash}.zip` (or directory)

## Requirements

- VS Code 1.85+
- Git installed and available in PATH

## Install

**From VSIX file:**

```bash
code --install-extension git-menu-ext-1.0.0.vsix
```

Or in VS Code: Extensions → `...` → Install from VSIX...

**From Marketplace:**
Search 'Git Menu Ext' in VS Code [Extensions] view.

## Build

Requires Node.js 18+.

```bash
npm install
npm run compile
npx vsce package --allow-missing-repository
```

Output: `git-menu-ext-*.vsix`
