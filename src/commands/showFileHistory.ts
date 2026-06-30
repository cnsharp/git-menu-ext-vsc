import * as vscode from 'vscode';
import * as path from 'path';
import { runGit, getRepositoryRoot } from '../git';

interface FileCommit {
    hash: string;
    date: string;
    author: string;
    message: string;
}

export async function showFileHistory(fileUri: vscode.Uri): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const relativePath = path.relative(repoRoot, fileUri.fsPath).replace(/\\/g, '/');
    const fileName = path.basename(fileUri.fsPath);

    const logResult = await runGit(
        ['log', '--follow', '--format=%H%x00%ad%x00%an%x00%s', '--date=format:%Y-%m-%d %H:%M', '--', relativePath],
        repoRoot
    );
    if (logResult.exitCode !== 0 || !logResult.stdout) {
        vscode.window.showWarningMessage('No history found for this file.');
        return;
    }

    const commits: FileCommit[] = logResult.stdout.split('\n').map(line => {
        const [hash, date, author, message] = line.split('\x00');
        return { hash, date, author, message };
    });

    const panel = vscode.window.createWebviewPanel(
        'gitFileHistory',
        `History: ${fileName}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(commits, fileName);

    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'selectCommit') {
            const idx = commits.findIndex(c => c.hash === msg.hash);
            if (idx < 0) { return; }

            const current = commits[idx];
            const prev = idx + 1 < commits.length ? commits[idx + 1] : null;

            const currentUri = vscode.Uri.parse(`gitshow:/${current.hash}/${relativePath}`);

            if (prev) {
                const prevUri = vscode.Uri.parse(`gitshow:/${prev.hash}/${relativePath}`);
                await vscode.commands.executeCommand('vscode.diff',
                    prevUri, currentUri,
                    `${fileName} (${prev.hash.substring(0, 7)} → ${current.hash.substring(0, 7)})`
                );
            } else {
                await vscode.window.showTextDocument(currentUri, { preview: true });
            }
        }
    });
}

function getWebviewContent(commits: FileCommit[], fileName: string): string {
    const rows = commits.map(c => `
        <tr class="commit-row" data-hash="${c.hash}">
            <td class="hash">${c.hash.substring(0, 7)}</td>
            <td class="date">${c.date}</td>
            <td class="author">${escapeHtml(c.author)}</td>
            <td class="message">${escapeHtml(c.message)}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body { font-family: var(--vscode-font-family, sans-serif); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 8px; }
    h3 { margin: 4px 0 8px; font-weight: normal; color: var(--vscode-foreground); }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border, #444); color: var(--vscode-descriptionForeground); font-weight: normal; }
    td { padding: 5px 8px; }
    .commit-row { cursor: pointer; }
    .commit-row:hover { background: var(--vscode-list-hoverBackground); }
    .commit-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .hash { font-family: var(--vscode-editor-font-family, monospace); color: var(--vscode-textLink-foreground); width: 70px; }
    .date { width: 130px; white-space: nowrap; }
    .author { width: 120px; }
    .message { }
</style>
</head>
<body>
    <h3>${escapeHtml(fileName)}</h3>
    <table>
        <thead><tr><th>Commit</th><th>Date</th><th>Author</th><th>Message</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <script>
        const vscode = acquireVsCodeApi();
        let selected = null;
        document.querySelectorAll('.commit-row').forEach(row => {
            row.addEventListener('click', () => {
                if (selected) selected.classList.remove('selected');
                row.classList.add('selected');
                selected = row;
                vscode.postMessage({ type: 'selectCommit', hash: row.dataset.hash });
            });
        });
    </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
