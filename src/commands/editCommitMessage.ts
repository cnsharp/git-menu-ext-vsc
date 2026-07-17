import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runGit, getRepositoryRoot } from '../git';

export async function editCommitMessage(): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    // A rebase-based rewrite requires a clean working tree.
    const statusResult = await runGit(['status', '--porcelain'], repoRoot);
    if (statusResult.exitCode === 0 && statusResult.stdout) {
        vscode.window.showWarningMessage('Please commit or stash your changes before editing a commit message.');
        return;
    }

    // List unpushed commits reachable from HEAD (not contained in any remote branch).
    // Pushed commits are intentionally excluded so they can never be rewritten.
    const logResult = await runGit(
        [
            'log', 'HEAD', '--not', '--remotes', '--no-merges',
            '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ad',
            '--date=format:%Y-%m-%d %H:%M',
        ],
        repoRoot
    );
    if (logResult.exitCode !== 0) {
        vscode.window.showWarningMessage('Failed to read git log.');
        return;
    }
    if (!logResult.stdout) {
        vscode.window.showInformationMessage('No unpushed commits available to edit.');
        return;
    }

    const commits = logResult.stdout.split('\n').map(line => {
        const [hash, shortHash, subject, author, date] = line.split('\x1f');
        return { hash, shortHash, subject, author, date };
    });

    const headResult = await runGit(['rev-parse', 'HEAD'], repoRoot);
    const headHash = headResult.stdout.trim();

    const pick = await vscode.window.showQuickPick(
        commits.map(c => ({
            label: `${c.hash === headHash ? '$(arrow-right) ' : ''}${c.subject}`,
            description: `${c.shortHash} · ${c.date}`,
            detail: c.author,
            hash: c.hash,
        })),
        {
            placeHolder: 'Select an unpushed commit to edit its message',
            matchOnDescription: true,
        }
    );
    if (!pick) {
        return;
    }

    const isHead = pick.hash === headHash;

    // Rewriting a commit with merge commits after it would flatten the merges.
    if (!isHead) {
        const mergeCheck = await runGit(['rev-list', '--merges', `${pick.hash}..HEAD`], repoRoot);
        if (mergeCheck.exitCode === 0 && mergeCheck.stdout) {
            vscode.window.showWarningMessage('Cannot edit: there are merge commits after the selected commit.');
            return;
        }
    }

    // Load the full original message (subject + body) for editing.
    const fullMsgResult = await runGit(['log', '-1', '--format=%B', pick.hash], repoRoot);
    const originalMessage = fullMsgResult.stdout;

    const tmpFile = path.join(repoRoot, '.git', 'EDIT_COMMIT_MSG');
    fs.writeFileSync(tmpFile, originalMessage.endsWith('\n') ? originalMessage : originalMessage + '\n');

    const doc = await vscode.workspace.openTextDocument(tmpFile);
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage('Edit the commit message. Save to confirm, close tab to cancel.');

    const message = await waitForMessage(tmpFile, doc);
    if (message === undefined) {
        vscode.window.showWarningMessage('Edit commit message cancelled.');
        cleanUp(tmpFile);
        return;
    }

    let ok: boolean;
    if (isHead) {
        const amend = await runGit(['commit', '--amend', '-F', tmpFile], repoRoot);
        ok = amend.exitCode === 0;
        if (!ok) {
            vscode.window.showErrorMessage(`Failed to amend commit: ${amend.stdout}`);
        }
    } else {
        ok = await rewriteNonHead(repoRoot, pick.hash, tmpFile);
    }

    closeTab(tmpFile);
    cleanUp(tmpFile);
    if (ok) {
        vscode.window.showInformationMessage('Commit message updated.');
    }
}

/**
 * Rewrite the message of a non-HEAD commit without an interactive rebase.
 *
 * 1. Recreate the target commit with `commit-tree` (same tree, same parent),
 *    preserving the original author identity/date, but with the new message.
 * 2. Replay the commits after the target onto the recreated commit using
 *    `git rebase --onto <new> <target>`.
 */
async function rewriteNonHead(repoRoot: string, hash: string, msgFile: string): Promise<boolean> {
    const authorResult = await runGit(['log', '-1', '--format=%an%x1f%ae%x1f%aI', hash], repoRoot);
    const [authorName, authorEmail, authorDate] = authorResult.stdout.split('\x1f');
    const authorEnv: NodeJS.ProcessEnv = {
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: authorDate,
    };

    const treeResult = await runGit(['rev-parse', `${hash}^{tree}`], repoRoot);
    if (treeResult.exitCode !== 0) {
        vscode.window.showErrorMessage('Failed to read commit tree.');
        return false;
    }
    const tree = treeResult.stdout.trim();

    const parentResult = await runGit(['rev-parse', `${hash}^`], repoRoot);
    const hasParent = parentResult.exitCode === 0;
    const parent = parentResult.stdout.trim();

    const commitTreeArgs = hasParent
        ? ['commit-tree', tree, '-p', parent, '-F', msgFile]
        : ['commit-tree', tree, '-F', msgFile];
    const newCommitResult = await runGit(commitTreeArgs, repoRoot, authorEnv);
    if (newCommitResult.exitCode !== 0) {
        vscode.window.showErrorMessage(`Failed to create new commit: ${newCommitResult.stdout}`);
        return false;
    }
    const newCommit = newCommitResult.stdout.trim();

    const rebaseResult = await runGit(['rebase', '--onto', newCommit, hash], repoRoot);
    if (rebaseResult.exitCode !== 0) {
        await runGit(['rebase', '--abort'], repoRoot);
        vscode.window.showErrorMessage('Failed to rewrite history. The operation was aborted.');
        return false;
    }
    return true;
}

async function waitForMessage(tmpFile: string, doc: vscode.TextDocument): Promise<string | undefined> {
    let lastCancelledContent: string | undefined;
    let closeJustCancelled = false;
    while (true) {
        const result = await new Promise<{ action: 'save'; content: string } | { action: 'close' }>((resolve) => {
            const onSave = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
                if (savedDoc.uri.fsPath === doc.uri.fsPath) {
                    onSave.dispose();
                    onTabClose.dispose();
                    resolve({ action: 'save', content: savedDoc.getText().trim() });
                }
            });
            const onTabClose = vscode.window.tabGroups.onDidChangeTabs((e) => {
                for (const tab of e.closed) {
                    if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === doc.uri.fsPath) {
                        onSave.dispose();
                        onTabClose.dispose();
                        resolve({ action: 'close' });
                        return;
                    }
                }
            });
        });

        if (result.action === 'save') {
            closeJustCancelled = false;
            if (!result.content) {
                return undefined;
            }
            if (result.content === lastCancelledContent) {
                continue;
            }
            const confirm = await vscode.window.showWarningMessage(
                'Update the commit message?',
                { modal: true },
                'Confirm'
            );
            if (confirm === 'Confirm') {
                return result.content;
            }
            lastCancelledContent = result.content;
            continue;
        }

        if (closeJustCancelled) {
            closeJustCancelled = false;
            doc = await vscode.workspace.openTextDocument(tmpFile);
            await vscode.window.showTextDocument(doc, { preview: false });
            continue;
        }
        const choice = await vscode.window.showWarningMessage(
            'The commit message has not been updated. Discard changes?',
            { modal: true },
            'Discard'
        );
        if (choice === 'Discard') {
            return undefined;
        }
        closeJustCancelled = true;
        doc = await vscode.workspace.openTextDocument(tmpFile);
        await vscode.window.showTextDocument(doc, { preview: false });
    }
}

function closeTab(filePath: string) {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === filePath) {
                vscode.window.tabGroups.close(tab);
                return;
            }
        }
    }
}

function cleanUp(tmpFile: string) {
    try { fs.unlinkSync(tmpFile); } catch {}
}
