import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runGit, getRepositoryRoot } from '../git';

export async function squashCommits(): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const logResult = await runGit(
        ['log', '--format=%h%x00%s%x00%ad', '--date=format:%Y-%m-%d %H:%M', '-50'],
        repoRoot
    );
    if (logResult.exitCode !== 0 || !logResult.stdout) {
        vscode.window.showWarningMessage('Failed to read git log.');
        return;
    }

    const commits = logResult.stdout.split('\n').map(line => {
        const [hash, message, date] = line.split('\x00');
        return { hash, message, date };
    });

    if (commits.length < 2) {
        vscode.window.showWarningMessage('Not enough commits to squash.');
        return;
    }

    const pick = await vscode.window.showQuickPick(
        commits.slice(1).map(c => ({ label: c.hash, description: c.date, detail: c.message })),
        { placeHolder: 'Squash HEAD down to this commit (inclusive)', matchOnDetail: true }
    );
    if (!pick) {
        return;
    }

    const targetIdx = commits.findIndex(c => c.hash === pick.label);
    const squashedCommits = commits.slice(0, targetIdx + 1);

    const messages = squashedCommits.map(c => c.message);
    const seen = new Set<string>();
    const deduped = messages.filter(m => {
        if (seen.has(m)) {
            return false;
        }
        seen.add(m);
        return true;
    });

    const tmpFile = path.join(repoRoot, '.git', 'SQUASH_MSG_EDIT');
    fs.writeFileSync(tmpFile, deduped.join('\n'));

    const doc = await vscode.workspace.openTextDocument(tmpFile);
    await vscode.window.showTextDocument(doc, { preview: false });

    vscode.window.showInformationMessage(
        `Squash ${squashedCommits.length} commits into one. Save to confirm, close tab to cancel.`
    );

    const message = await waitForMessage(tmpFile, doc, squashedCommits.length);

    if (!message) {
        vscode.window.showWarningMessage('Squash cancelled.');
        cleanUp(tmpFile);
        return;
    }

    const resetResult = await runGit(['reset', '--soft', `${pick.label}~1`], repoRoot);
    if (resetResult.exitCode !== 0) {
        vscode.window.showErrorMessage(`Failed to reset: ${resetResult.stdout}`);
        cleanUp(tmpFile);
        return;
    }

    const commitResult = await runGit(['commit', '-m', message], repoRoot);
    if (commitResult.exitCode !== 0) {
        vscode.window.showErrorMessage(`Failed to commit: ${commitResult.stdout}`);
        cleanUp(tmpFile);
        return;
    }

    closeTab(tmpFile);
    cleanUp(tmpFile);
    vscode.window.showInformationMessage(`Squashed ${squashedCommits.length} commits into one.`);
}

async function waitForMessage(tmpFile: string, doc: vscode.TextDocument, count: number): Promise<string | undefined> {
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
                `Squash ${count} commits into one?`,
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
            'Squash has not been executed. Discard?',
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
