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
