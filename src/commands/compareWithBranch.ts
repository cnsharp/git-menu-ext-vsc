import * as vscode from 'vscode';
import * as path from 'path';
import { runGit, getRepositoryRoot, getCurrentBranchName } from '../git';

export async function compareWithBranch(fileUri: vscode.Uri): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const result = await runGit(['branch', '-a', '--format=%(refname:short)'], repoRoot);
    if (result.exitCode !== 0 || !result.stdout) {
        vscode.window.showWarningMessage('Failed to list branches.');
        return;
    }

    const currentBranch = getCurrentBranchName();
    const remoteResult = await runGit(['remote'], repoRoot);
    const remotes = new Set(remoteResult.stdout.split('\n').filter(r => r.length > 0));
    const all = result.stdout.split('\n').filter(b => b.length > 0 && b !== currentBranch && !remotes.has(b));
    const remotePrefixes = [...remotes].map(r => r + '/');
    const isRemote = (b: string) => remotePrefixes.some(p => b.startsWith(p));
    const local = all.filter(b => !isRemote(b));
    const remote = all.filter(b => isRemote(b));

    const items: vscode.QuickPickItem[] = [
        ...local.map(b => ({ label: b })),
        ...(local.length > 0 && remote.length > 0
            ? [{ label: 'remote branches', kind: vscode.QuickPickItemKind.Separator }]
            : []),
        ...remote.map(b => ({ label: b })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a branch to compare with',
    });
    if (!picked) { return; }

    const relativePath = path.relative(repoRoot, fileUri.fsPath).replace(/\\/g, '/');
    const fileName = path.basename(fileUri.fsPath);

    const branchUri = vscode.Uri.parse(`gitshow:/${picked.label}/${relativePath}`);
    await vscode.commands.executeCommand('vscode.diff',
        branchUri, fileUri,
        `${fileName} (${picked.label} ↔ current)`
    );
}
