import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { GitResult } from './types';

export function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<GitResult> {
    return new Promise((resolve) => {
        execFile(
            'git',
            args,
            {
                cwd,
                maxBuffer: 10 * 1024 * 1024,
                env: env ? { ...process.env, ...env } : undefined,
            },
            (error, stdout, stderr) => {
                resolve({
                    stdout: (stdout || '').trim(),
                    exitCode: error ? (error as any).code ?? 1 : 0,
                });
            }
        );
    });
}

export interface GitChange {
    uri: vscode.Uri;
}

export interface GitRepository {
    rootUri: vscode.Uri;
    state: {
        HEAD?: { name?: string };
        indexChanges: GitChange[];
        workingTreeChanges: GitChange[];
        onDidChange: vscode.Event<void>;
    };
}

interface GitExtensionAPI {
    getAPI(version: 1): {
        repositories: GitRepository[];
        onDidOpenRepository: vscode.Event<GitRepository>;
    };
}

export function getGitAPI() {
    const gitExtension = vscode.extensions.getExtension<GitExtensionAPI>('vscode.git');
    if (!gitExtension?.isActive) {
        return undefined;
    }
    return gitExtension.exports.getAPI(1);
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
