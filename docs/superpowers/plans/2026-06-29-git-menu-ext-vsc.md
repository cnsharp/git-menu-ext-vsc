# Git Menu Ext VS Code Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that provides 4 Git utilities — Copy Branch Name, Delete Branches, Delete Outdated Branches, Export Changed Files — ported from the IntelliJ Git Menu Ext plugin.

**Architecture:** Hybrid Git integration — VS Code Git extension API for repo discovery and current branch, Git CLI via `child_process.execFile` for all operations. Commands registered in `extension.ts`, each feature in its own module under `src/commands/`. Shared Git utilities in `src/git.ts`.

**Tech Stack:** TypeScript, VS Code Extension API (^1.85.0), yazl (zip creation), Node.js built-in `child_process`/`fs`/`path`.

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Extension manifest: metadata, commands, menus, dependencies, scripts |
| `tsconfig.json` | TypeScript config targeting ES2022, CommonJS output to `out/` |
| `.gitignore` | Ignore `node_modules/`, `out/`, `*.vsix` |
| `.vscodeignore` | Exclude source/dev files from packaged extension |
| `src/types.ts` | Shared types: `GitResult`, `OutdatedBranch` |
| `src/git.ts` | `runGit()` CLI wrapper, `getRepository()`, `getCurrentBranchName()` |
| `src/extension.ts` | `activate()` — register all 4 commands, store `ExtensionContext` |
| `src/commands/copyBranchName.ts` | Copy current branch name to clipboard |
| `src/commands/deleteBranches.ts` | Batch delete branches matching keyword |
| `src/commands/deleteOutdatedBranches.ts` | Delete branches with gone remotes |
| `src/commands/exportChangedFiles.ts` | Export files changed between two commits |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.vscodeignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "git-menu-ext",
  "displayName": "Git Menu Ext",
  "description": "Git branch management and file export utilities",
  "version": "1.0.0",
  "publisher": "cnsharp",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["SCM Providers"],
  "keywords": ["git", "branch", "export", "delete"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "extensionDependencies": ["vscode.git"],
  "contributes": {
    "commands": [
      {
        "command": "gitMenuExt.copyBranchName",
        "title": "Copy Branch Name",
        "category": "Git"
      },
      {
        "command": "gitMenuExt.deleteBranches",
        "title": "Delete Branches...",
        "category": "Git"
      },
      {
        "command": "gitMenuExt.deleteOutdatedBranches",
        "title": "Delete Outdated Branches...",
        "category": "Git"
      },
      {
        "command": "gitMenuExt.exportChangedFiles",
        "title": "Export Changed Files...",
        "category": "Git"
      }
    ],
    "menus": {
      "scm/title": [
        {
          "command": "gitMenuExt.copyBranchName",
          "group": "gitMenuExt@1"
        },
        {
          "command": "gitMenuExt.deleteBranches",
          "group": "gitMenuExt@2"
        },
        {
          "command": "gitMenuExt.deleteOutdatedBranches",
          "group": "gitMenuExt@3"
        },
        {
          "command": "gitMenuExt.exportChangedFiles",
          "group": "gitMenuExt@4"
        }
      ]
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "dependencies": {
    "yazl": "^2.5.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.85.0",
    "@types/yazl": "^2.4.5",
    "@vscode/vsce": "^3.2.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "out",
    "rootDir": "src",
    "lib": ["ES2022"],
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
out/
*.vsix
.vscode-test/
```

- [ ] **Step 4: Create `.vscodeignore`**

```
.vscode/**
.vscode-test/**
src/**
tsconfig.json
**/*.map
node_modules/@types/**
node_modules/@vscode/**
node_modules/typescript/**
.gitignore
docs/**
```

- [ ] **Step 5: Install dependencies and verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npm install`
Expected: clean install, `node_modules/` created

- [ ] **Step 6: Initialize git repo**

```bash
cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc
git init
git add package.json tsconfig.json .gitignore .vscodeignore package-lock.json
git commit -m "chore: scaffold VS Code extension project"
```

---

### Task 2: Shared Types & Git Utilities

**Files:**
- Create: `src/types.ts`
- Create: `src/git.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface GitResult {
    stdout: string;
    exitCode: number;
}

export interface OutdatedBranch {
    name: string;
    isMerged: boolean;
}
```

- [ ] **Step 2: Create `src/git.ts`**

```typescript
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { GitResult } from './types';

export function runGit(args: string[], cwd: string): Promise<GitResult> {
    return new Promise((resolve) => {
        execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            resolve({
                stdout: (stdout || '').trim(),
                exitCode: error ? (error as any).code ?? 1 : 0,
            });
        });
    });
}

interface GitExtensionAPI {
    getAPI(version: 1): {
        repositories: Array<{
            rootUri: vscode.Uri;
            state: {
                HEAD?: { name?: string };
            };
        }>;
    };
}

export function getRepositoryRoot(): string | undefined {
    const gitExtension = vscode.extensions.getExtension<GitExtensionAPI>('vscode.git');
    if (!gitExtension?.isActive) {
        return undefined;
    }
    const api = gitExtension.exports.getAPI(1);
    const repo = api.repositories[0];
    return repo?.rootUri.fsPath;
}

export function getCurrentBranchName(): string | undefined {
    const gitExtension = vscode.extensions.getExtension<GitExtensionAPI>('vscode.git');
    if (!gitExtension?.isActive) {
        return undefined;
    }
    const api = gitExtension.exports.getAPI(1);
    const repo = api.repositories[0];
    return repo?.state.HEAD?.name;
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/git.ts
git commit -m "feat: add shared types and git utilities"
```

---

### Task 3: Extension Entry Point

**Files:**
- Create: `src/extension.ts`

- [ ] **Step 1: Create `src/extension.ts`**

```typescript
import * as vscode from 'vscode';
import { copyBranchName } from './commands/copyBranchName';
import { deleteBranches } from './commands/deleteBranches';
import { deleteOutdatedBranches } from './commands/deleteOutdatedBranches';
import { exportChangedFiles } from './commands/exportChangedFiles';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitMenuExt.copyBranchName', () => copyBranchName()),
        vscode.commands.registerCommand('gitMenuExt.deleteBranches', () => deleteBranches(context)),
        vscode.commands.registerCommand('gitMenuExt.deleteOutdatedBranches', () => deleteOutdatedBranches()),
        vscode.commands.registerCommand('gitMenuExt.exportChangedFiles', () => exportChangedFiles(context)),
    );
}

export function deactivate() {}
```

Note: This will not compile yet — the command modules don't exist. They are created in Tasks 4–7. Defer compilation verification to Task 4.

- [ ] **Step 2: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add extension entry point with command registration"
```

---

### Task 4: Copy Branch Name

**Files:**
- Create: `src/commands/copyBranchName.ts`

- [ ] **Step 1: Create `src/commands/copyBranchName.ts`**

```typescript
import * as vscode from 'vscode';
import { getCurrentBranchName } from '../git';

export async function copyBranchName(): Promise<void> {
    const branchName = getCurrentBranchName();
    if (!branchName) {
        vscode.window.showWarningMessage('No Git branch found.');
        return;
    }
    await vscode.env.clipboard.writeText(branchName);
    vscode.window.showInformationMessage(`Branch name copied: ${branchName}`);
}
```

- [ ] **Step 2: Create stub files for remaining commands so compilation succeeds**

Create `src/commands/deleteBranches.ts`:
```typescript
import * as vscode from 'vscode';

export async function deleteBranches(context: vscode.ExtensionContext): Promise<void> {
    // implemented in Task 5
}
```

Create `src/commands/deleteOutdatedBranches.ts`:
```typescript
export async function deleteOutdatedBranches(): Promise<void> {
    // implemented in Task 6
}
```

Create `src/commands/exportChangedFiles.ts`:
```typescript
import * as vscode from 'vscode';

export async function exportChangedFiles(context: vscode.ExtensionContext): Promise<void> {
    // implemented in Task 7
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/commands/
git commit -m "feat: implement Copy Branch Name command"
```

---

### Task 5: Delete Branches

**Files:**
- Modify: `src/commands/deleteBranches.ts`

- [ ] **Step 1: Implement `src/commands/deleteBranches.ts`**

Replace the stub with the full implementation:

```typescript
import * as vscode from 'vscode';
import { runGit, getRepositoryRoot, getCurrentBranchName } from '../git';

const STATE_KEY = 'gitMenuExt.deleteBranches.keyword';

export async function deleteBranches(context: vscode.ExtensionContext): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const lastKeyword = context.workspaceState.get<string>(STATE_KEY, '');
    const keyword = await vscode.window.showInputBox({
        prompt: 'Enter keyword to match branch names',
        value: lastKeyword,
        placeHolder: 'e.g. feature-, release-',
    });
    if (keyword === undefined || keyword.trim() === '') {
        return;
    }
    await context.workspaceState.update(STATE_KEY, keyword.trim());

    const deleteRemote = await vscode.window.showQuickPick(
        [{ label: 'No', value: false }, { label: 'Yes', value: true }],
        { placeHolder: 'Also delete remote branches?' }
    );
    if (!deleteRemote) {
        return;
    }

    const currentBranch = getCurrentBranchName();

    const localResult = await runGit(['branch', '--list', `*${keyword.trim()}*`], repoRoot);
    const localBranches = localResult.stdout
        .split('\n')
        .map(b => b.replace(/^\*?\s+/, '').trim())
        .filter(b => b && b !== currentBranch);

    let remoteBranches: string[] = [];
    if (deleteRemote.value) {
        const remoteResult = await runGit(['branch', '-r', '--list', `*${keyword.trim()}*`], repoRoot);
        remoteBranches = remoteResult.stdout
            .split('\n')
            .map(b => b.trim())
            .filter(b => b && !b.includes('->'));
    }

    if (localBranches.length === 0 && remoteBranches.length === 0) {
        vscode.window.showInformationMessage(`No branches matching "${keyword.trim()}" found.`);
        return;
    }

    const items: string[] = [];
    if (localBranches.length > 0) {
        items.push(...localBranches.map(b => `local: ${b}`));
    }
    if (remoteBranches.length > 0) {
        items.push(...remoteBranches.map(b => `remote: ${b}`));
    }

    const confirm = await vscode.window.showQuickPick(
        ['Yes, delete them', 'Cancel'],
        { placeHolder: `Delete ${items.length} branch(es)?\n${items.join(', ')}` }
    );
    if (confirm !== 'Yes, delete them') {
        return;
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const branch of localBranches) {
        const result = await runGit(['branch', '-D', branch], repoRoot);
        if (result.exitCode === 0) {
            deletedCount++;
        } else {
            errors.push(`Failed to delete local branch ${branch}: ${result.stdout}`);
        }
    }

    for (const remoteBranch of remoteBranches) {
        const parts = remoteBranch.split('/');
        const remote = parts[0];
        const branch = parts.slice(1).join('/');
        const result = await runGit(['push', remote, '--delete', branch], repoRoot);
        if (result.exitCode === 0) {
            deletedCount++;
        } else {
            errors.push(`Failed to delete remote branch ${remoteBranch}: ${result.stdout}`);
        }
    }

    if (errors.length > 0) {
        vscode.window.showWarningMessage(`Deleted ${deletedCount} branch(es). Errors: ${errors.join('; ')}`);
    } else {
        vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} branch(es).`);
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/deleteBranches.ts
git commit -m "feat: implement Delete Branches command"
```

---

### Task 6: Delete Outdated Branches

**Files:**
- Modify: `src/commands/deleteOutdatedBranches.ts`

- [ ] **Step 1: Implement `src/commands/deleteOutdatedBranches.ts`**

Replace the stub with the full implementation:

```typescript
import * as vscode from 'vscode';
import { runGit, getRepositoryRoot, getCurrentBranchName } from '../git';
import { OutdatedBranch } from '../types';

export async function deleteOutdatedBranches(): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const currentBranch = getCurrentBranchName();

    const vvResult = await runGit(['branch', '-vv'], repoRoot);
    const goneBranches: string[] = vvResult.stdout
        .split('\n')
        .filter(line => line.includes(': gone]'))
        .map(line => line.replace(/^\*?\s+/, '').split(/\s+/)[0])
        .filter(b => b && b !== currentBranch);

    if (goneBranches.length === 0) {
        vscode.window.showInformationMessage('No outdated branches found.');
        return;
    }

    const mergedResult = await runGit(['branch', '--merged'], repoRoot);
    const mergedBranches = new Set(
        mergedResult.stdout.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean)
    );

    const outdated: OutdatedBranch[] = goneBranches.map(name => ({
        name,
        isMerged: mergedBranches.has(name),
    }));

    const items: vscode.QuickPickItem[] = outdated.map(b => ({
        label: b.isMerged ? b.name : `$(warning) ${b.name}`,
        description: b.isMerged ? 'merged' : 'not merged',
        picked: true,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select outdated branches to delete',
    });

    if (!selected || selected.length === 0) {
        return;
    }

    const selectedNames = selected.map(item => item.label.replace(/^\$\(warning\)\s*/, ''));

    let deletedCount = 0;
    const errors: string[] = [];

    for (const name of selectedNames) {
        const branch = outdated.find(b => b.name === name)!;
        const flag = branch.isMerged ? '-d' : '-D';
        const result = await runGit(['branch', flag, name], repoRoot);
        if (result.exitCode === 0) {
            deletedCount++;
        } else {
            errors.push(`Failed to delete ${name}: ${result.stdout}`);
        }
    }

    if (errors.length > 0) {
        vscode.window.showWarningMessage(`Deleted ${deletedCount} branch(es). Errors: ${errors.join('; ')}`);
    } else {
        vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} outdated branch(es).`);
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/deleteOutdatedBranches.ts
git commit -m "feat: implement Delete Outdated Branches command"
```

---

### Task 7: Export Changed Files

**Files:**
- Modify: `src/commands/exportChangedFiles.ts`

- [ ] **Step 1: Implement `src/commands/exportChangedFiles.ts`**

Replace the stub with the full implementation:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yazl from 'yazl';
import { runGit, getRepositoryRoot } from '../git';

const KEY_EXTENSIONS = 'gitMenuExt.exportChangedFiles.extensions';
const KEY_OUTPUT_DIR = 'gitMenuExt.exportChangedFiles.outputDir';
const KEY_AS_ZIP = 'gitMenuExt.exportChangedFiles.asZip';

export async function exportChangedFiles(context: vscode.ExtensionContext): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const logResult = await runGit(['log', '--oneline', '-50'], repoRoot);
    if (logResult.exitCode !== 0 || !logResult.stdout) {
        vscode.window.showWarningMessage('Failed to read git log.');
        return;
    }

    const commits = logResult.stdout.split('\n').map(line => {
        const spaceIdx = line.indexOf(' ');
        return {
            hash: line.substring(0, spaceIdx),
            message: line.substring(spaceIdx + 1),
        };
    });

    const olderPick = await vscode.window.showQuickPick(
        commits.map(c => ({ label: c.hash, description: c.message })),
        { placeHolder: 'Select older commit' }
    );
    if (!olderPick) {
        return;
    }

    const olderIdx = commits.findIndex(c => c.hash === olderPick.label);
    const newerCommits = commits.slice(0, olderIdx);
    if (newerCommits.length === 0) {
        vscode.window.showWarningMessage('No newer commits available.');
        return;
    }

    const newerPick = await vscode.window.showQuickPick(
        newerCommits.map(c => ({ label: c.hash, description: c.message })),
        { placeHolder: 'Select newer commit' }
    );
    if (!newerPick) {
        return;
    }

    const lastExtensions = context.workspaceState.get<string>(KEY_EXTENSIONS, '');
    const extensionsInput = await vscode.window.showInputBox({
        prompt: 'File extension filter (optional, space/comma separated)',
        value: lastExtensions,
        placeHolder: 'e.g. java ts xml (leave empty for all)',
    });
    if (extensionsInput === undefined) {
        return;
    }
    await context.workspaceState.update(KEY_EXTENSIONS, extensionsInput);

    const lastOutputDir = context.workspaceState.get<string>(KEY_OUTPUT_DIR, '');
    const outputUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Output Directory',
        defaultUri: lastOutputDir ? vscode.Uri.file(lastOutputDir) : undefined,
    });
    if (!outputUri || outputUri.length === 0) {
        return;
    }
    const outputDir = outputUri[0].fsPath;
    await context.workspaceState.update(KEY_OUTPUT_DIR, outputDir);

    const lastAsZip = context.workspaceState.get<boolean>(KEY_AS_ZIP, true);
    const zipPick = await vscode.window.showQuickPick(
        [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
        ].sort((a, b) => (a.value === lastAsZip ? -1 : 1)),
        { placeHolder: 'Export as zip?' }
    );
    if (!zipPick) {
        return;
    }
    await context.workspaceState.update(KEY_AS_ZIP, zipPick.value);

    const olderHash = olderPick.label;
    const newerHash = newerPick.label;

    const diffResult = await runGit(
        ['diff', '--name-only', '--diff-filter=ACMR', `${olderHash}..${newerHash}`],
        repoRoot
    );
    if (diffResult.exitCode !== 0) {
        vscode.window.showErrorMessage(`Failed to get diff: ${diffResult.stdout}`);
        return;
    }

    let files = diffResult.stdout.split('\n').filter(Boolean);

    if (extensionsInput.trim()) {
        const extensions = extensionsInput
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(ext => (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
        files = files.filter(f => extensions.includes(path.extname(f).toLowerCase()));
    }

    if (files.length === 0) {
        vscode.window.showInformationMessage('No changed files match the filter.');
        return;
    }

    const projectName = path.basename(repoRoot);
    const baseName = `${projectName}-${olderHash.substring(0, 7)}-${newerHash.substring(0, 7)}`;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting changed files...' },
        async (progress) => {
            if (zipPick.value) {
                const zipPath = path.join(outputDir, `${baseName}.zip`);
                const zipFile = new yazl.ZipFile();
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    progress.report({ message: file, increment: (100 / files.length) });
                    const contentResult = await runGit(['show', `${newerHash}:${file}`], repoRoot);
                    if (contentResult.exitCode === 0) {
                        zipFile.addBuffer(Buffer.from(contentResult.stdout), file);
                    }
                }
                zipFile.end();
                await new Promise<void>((resolve, reject) => {
                    const writeStream = fs.createWriteStream(zipPath);
                    zipFile.outputStream.pipe(writeStream);
                    writeStream.on('close', resolve);
                    writeStream.on('error', reject);
                });
            } else {
                const destDir = path.join(outputDir, baseName);
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    progress.report({ message: file, increment: (100 / files.length) });
                    const contentResult = await runGit(['show', `${newerHash}:${file}`], repoRoot);
                    if (contentResult.exitCode === 0) {
                        const destPath = path.join(destDir, file);
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, contentResult.stdout);
                    }
                }
            }
        }
    );

    const action = await vscode.window.showInformationMessage(
        `Exported ${files.length} file(s) to ${outputDir}.`,
        'Open Folder'
    );
    if (action === 'Open Folder') {
        const folderUri = vscode.Uri.file(outputDir);
        await vscode.commands.executeCommand('revealFileInOS', folderUri);
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/exportChangedFiles.ts
git commit -m "feat: implement Export Changed Files command"
```

---

### Task 8: Build, Test & Package

**Files:**
- None new — verify existing code works end-to-end

- [ ] **Step 1: Full compile**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npm run compile`
Expected: clean compilation, `out/` directory created with `.js` and `.map` files

- [ ] **Step 2: Verify output structure**

Run: `find out -type f -name '*.js' | sort`
Expected:
```
out/commands/copyBranchName.js
out/commands/deleteBranches.js
out/commands/deleteOutdatedBranches.js
out/commands/exportChangedFiles.js
out/extension.js
out/git.js
out/types.js
```

- [ ] **Step 3: Package as .vsix**

Run: `cd /Users/qinqinbo/IdeaProjects/git-menu-ext-vsc && npx vsce package --allow-missing-repository`
Expected: `git-menu-ext-1.0.0.vsix` created

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify build and package"
```
