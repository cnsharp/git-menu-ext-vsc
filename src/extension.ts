import * as vscode from 'vscode';
import * as path from 'path';
import { copyBranchName } from './commands/copyBranchName';
import { deleteBranches } from './commands/deleteBranches';
import { deleteOutdatedBranches } from './commands/deleteOutdatedBranches';
import { exportChangedFiles } from './commands/exportChangedFiles';
import { squashCommits } from './commands/squashCommits';
import { showFileHistory } from './commands/showFileHistory';
import { compareWithBranch } from './commands/compareWithBranch';
import { GitRevisionProvider } from './gitRevisionProvider';
import { getGitAPI, GitRepository, runGit } from './git';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    const revisionProvider = new GitRevisionProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('gitshow', revisionProvider),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitMenuExt.copyBranchName', () => copyBranchName()),
        vscode.commands.registerCommand('gitMenuExt.deleteBranches', () => deleteBranches(context)),
        vscode.commands.registerCommand('gitMenuExt.deleteOutdatedBranches', () => deleteOutdatedBranches()),
        vscode.commands.registerCommand('gitMenuExt.exportChangedFiles', () => exportChangedFiles(context)),
        vscode.commands.registerCommand('gitMenuExt.squashCommits', () => squashCommits()),
        vscode.commands.registerCommand('gitMenuExt.stageChanges', () => {
            vscode.commands.executeCommand('git.stage');
        }),
        vscode.commands.registerCommand('gitMenuExt.unstageChanges', () => {
            vscode.commands.executeCommand('git.unstage');
        }),
        vscode.commands.registerCommand('gitMenuExt.discardChanges', () => {
            vscode.commands.executeCommand('git.clean');
        }),
        vscode.commands.registerCommand('gitMenuExt.openChanges', () => {
            vscode.commands.executeCommand('git.openChange');
        }),
        vscode.commands.registerCommand('gitMenuExt.showFileHistory', (uri?: vscode.Uri) => {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (fileUri) { showFileHistory(fileUri); }
        }),
        vscode.commands.registerCommand('gitMenuExt.compareWithBranch', (uri?: vscode.Uri) => {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (fileUri) { compareWithBranch(fileUri); }
        }),
    );

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    statusBarItem.command = 'gitMenuExt.copyBranchName';
    statusBarItem.text = '$(copy)';
    statusBarItem.tooltip = 'Copy Branch Name';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    setupEditorContext(context);
}

function setupEditorContext(context: vscode.ExtensionContext) {
    const api = getGitAPI();
    if (!api) { return; }

    async function updateContext() {
        vscode.commands.executeCommand('setContext', 'gitMenuExt.inRepo', false);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.canStage', false);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.canUnstage', false);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.hasChanges', false);

        const uri = vscode.window.activeTextEditor?.document.uri;
        if (!uri || uri.scheme !== 'file' || !api) { return; }

        let inRepo = false;
        let canStage = false;
        let canUnstage = false;
        let hasChanges = false;

        for (const repo of api.repositories) {
            if (!uri.fsPath.startsWith(repo.rootUri.fsPath)) { continue; }
            const relativePath = path.relative(repo.rootUri.fsPath, uri.fsPath);
            const ignoreResult = await runGit(['check-ignore', '-q', relativePath], repo.rootUri.fsPath);
            if (ignoreResult.exitCode === 0) { break; }
            inRepo = true;
            const inWorking = repo.state.workingTreeChanges.some(c => c.uri.fsPath === uri.fsPath);
            const inIndex = repo.state.indexChanges.some(c => c.uri.fsPath === uri.fsPath);
            canStage = inWorking;
            canUnstage = inIndex;
            hasChanges = inWorking || inIndex;
            break;
        }

        vscode.commands.executeCommand('setContext', 'gitMenuExt.inRepo', inRepo);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.canStage', canStage);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.canUnstage', canUnstage);
        vscode.commands.executeCommand('setContext', 'gitMenuExt.hasChanges', hasChanges);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => updateContext())
    );

    for (const repo of api.repositories) {
        context.subscriptions.push(repo.state.onDidChange(() => updateContext()));
    }
    api.onDidOpenRepository((repo: GitRepository) => {
        context.subscriptions.push(repo.state.onDidChange(() => updateContext()));
    });

    updateContext();
}

export function deactivate() {}
