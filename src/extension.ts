import * as vscode from 'vscode';
import { copyBranchName } from './commands/copyBranchName';
import { deleteBranches } from './commands/deleteBranches';
import { deleteOutdatedBranches } from './commands/deleteOutdatedBranches';
import { exportChangedFiles } from './commands/exportChangedFiles';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('gitMenuExt.copyBranchName', () => copyBranchName()),
        vscode.commands.registerCommand('gitMenuExt.deleteBranches', () => deleteBranches(context)),
        vscode.commands.registerCommand('gitMenuExt.deleteOutdatedBranches', () => deleteOutdatedBranches()),
        vscode.commands.registerCommand('gitMenuExt.exportChangedFiles', () => exportChangedFiles(context)),
    );

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    statusBarItem.command = 'gitMenuExt.copyBranchName';
    statusBarItem.text = '$(copy)';
    statusBarItem.tooltip = 'Copy Branch Name';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {}
