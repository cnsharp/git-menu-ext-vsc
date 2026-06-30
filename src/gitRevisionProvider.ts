import * as vscode from 'vscode';
import { runGit, getRepositoryRoot } from './git';

export class GitRevisionProvider implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const repoRoot = getRepositoryRoot();
        if (!repoRoot) {
            return '';
        }
        const [hash, ...pathParts] = uri.path.substring(1).split('/');
        const filePath = pathParts.join('/');
        const result = await runGit(['show', `${hash}:${filePath}`], repoRoot);
        return result.exitCode === 0 ? result.stdout : '';
    }
}
