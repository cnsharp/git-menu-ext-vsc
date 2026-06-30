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
