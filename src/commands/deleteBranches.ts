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
