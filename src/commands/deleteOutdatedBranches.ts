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

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Fetching remote status...' },
        () => runGit(['fetch', '--prune'], repoRoot)
    );

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
