# Git Menu Ext — VS Code Extension Design

## Overview

A VS Code extension that provides 4 Git branch management and file export features, ported from the [IntelliJ Git Menu Ext](../../../git-menu-ext-intellij/) plugin.

- **Publisher:** `cnsharp`
- **Display Name:** `Git Menu Ext`
- **ID:** `cnsharp.git-menu-ext`
- **Engine:** `vscode ^1.85.0`
- **Language:** TypeScript
- **Activation:** `onStartupFinished`

## Project Structure

```
git-menu-ext-vsc/
├── .gitignore
├── .vscodeignore
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts          # Activation, command registration
│   ├── git.ts                # Git CLI wrapper + VS Code Git API helpers
│   ├── commands/
│   │   ├── copyBranchName.ts
│   │   ├── deleteBranches.ts
│   │   ├── deleteOutdatedBranches.ts
│   │   └── exportChangedFiles.ts
│   └── types.ts              # Shared types (GitResult, OutdatedBranch, etc.)
├── resources/
│   └── icon.png
└── README.md
```

## Commands & Menu Integration

| Command ID | Display Name | Menu Placement |
|---|---|---|
| `gitMenuExt.copyBranchName` | Copy Branch Name | Command Palette, SCM title menu |
| `gitMenuExt.deleteBranches` | Delete Branches... | Command Palette, SCM title menu |
| `gitMenuExt.deleteOutdatedBranches` | Delete Outdated Branches... | Command Palette, SCM title menu |
| `gitMenuExt.exportChangedFiles` | Export Changed Files... | Command Palette, SCM title menu |

All commands are placed in the `scm/title` menu group (the `...` menu in Source Control view). All require a Git repository to be open.

## Feature Behavior

### 1. Copy Branch Name

- Gets current branch name via VS Code Git extension API (`repository.state.HEAD.name`)
- Copies to clipboard via `vscode.env.clipboard.writeText()`
- Shows info notification: "Branch name copied: {name}"

### 2. Delete Branches

1. **InputBox** — enter keyword to match branches (remembers last keyword via `workspaceState`)
2. **QuickPick checkbox** — "Also delete remote branches?"
3. Runs `git branch --list *keyword*` to find matching local branches; excludes current branch
4. If remote selected: also finds matching remote branches via `git branch -r --list *keyword*`
5. **Confirmation QuickPick** — shows all branches to be deleted, user confirms
6. Executes `git branch -D` for local branches
7. Executes `git push <remote> --delete <branch>` for remote branches
8. Shows result notification with deleted count

### 3. Delete Outdated Branches

1. Runs `git branch -vv` to find branches with `[gone]` tracking status (remote deleted)
2. Runs `git branch --merged` to detect merge status
3. **QuickPick multi-select** — all candidates shown, pre-selected by default
   - Unmerged branches marked with `$(warning)` icon
   - Current branch excluded
4. Uses `git branch -d` for merged branches, `git branch -D` for unmerged
5. Shows result notification with deleted count

### 4. Export Changed Files

1. **QuickPick** — "Select older commit" from recent 50 commits (`git log --oneline -50`)
2. **QuickPick** — "Select newer commit" from commits newer than selected
3. **InputBox** — file extension filter (optional, space/comma separated, remembers via `workspaceState`)
4. **Folder picker** — output directory (remembers last used via `workspaceState`)
5. **QuickPick** — "Export as zip?" Yes/No
6. Runs `git diff --name-only --diff-filter=ACMR <old>..<new>` to get changed files
7. Filters by extensions if specified (case-insensitive, leading dot optional)
8. Reads file contents via `git show <new>:<path>`
9. Creates output:
   - **Zip:** using `yazl` library, named `{projectName}-{oldHash7}-{newHash7}.zip`
   - **Directory:** named `{projectName}-{oldHash7}-{newHash7}/`, preserving directory structure
10. Shows completion notification with option to open output folder

## Architecture

### Git Integration (Hybrid Approach)

- **VS Code Git Extension API** — used for repository discovery and current branch info (`vscode.extensions.getExtension('vscode.git')`)
- **Git CLI** — used for all operations (delete, diff, branch listing) via `child_process.execFile`

### `src/git.ts` — Shared Git Utilities

```typescript
interface GitResult {
  stdout: string;
  exitCode: number;
}

function runGit(args: string[], cwd: string): Promise<GitResult>
function getRepository(): GitRepository | undefined
function getCurrentBranchName(): string | undefined
```

### `src/types.ts` — Shared Types

```typescript
interface OutdatedBranch {
  name: string;
  isMerged: boolean;
}
```

## Dependencies

### Runtime

- `yazl` — zip file creation

### Dev

- `typescript`
- `@types/vscode`
- `@types/node`
- `@types/yazl`
- `@vscode/vsce` — packaging

## Persistent State

All user preferences stored via `context.workspaceState`:

| Key | Used by | Value |
|---|---|---|
| `gitMenuExt.deleteBranches.keyword` | Delete Branches | Last entered keyword |
| `gitMenuExt.exportChangedFiles.extensions` | Export Changed Files | Last extension filter |
| `gitMenuExt.exportChangedFiles.outputDir` | Export Changed Files | Last output directory |
| `gitMenuExt.exportChangedFiles.asZip` | Export Changed Files | Last zip preference |
