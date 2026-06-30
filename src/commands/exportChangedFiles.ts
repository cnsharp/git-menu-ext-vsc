import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yazl from 'yazl';
import { runGit, getRepositoryRoot } from '../git';

const KEY_EXTENSIONS = 'gitMenuExt.exportChangedFiles.extensions';
const KEY_OUTPUT_DIR = 'gitMenuExt.exportChangedFiles.outputDir';

export async function exportChangedFiles(context: vscode.ExtensionContext): Promise<void> {
    const repoRoot = getRepositoryRoot();
    if (!repoRoot) {
        vscode.window.showWarningMessage('No Git repository found.');
        return;
    }

    const logResult = await runGit(
        ['log', '--format=%h%x00%s%x00%ad', '--date=format:%Y-%m-%d %H:%M', '-50'],
        repoRoot
    );
    if (logResult.exitCode !== 0 || !logResult.stdout) {
        vscode.window.showWarningMessage('Failed to read git log.');
        return;
    }

    const commits = logResult.stdout.split('\n').map(line => {
        const [hash, message, date] = line.split('\x00');
        return { hash, message, date };
    });

    const toPickItems = (list: typeof commits) =>
        list.map(c => ({ label: c.hash, description: c.date, detail: c.message }));

    const olderPick = await vscode.window.showQuickPick(
        toPickItems(commits),
        { placeHolder: 'Select older commit', matchOnDetail: true }
    );
    if (!olderPick) {
        return;
    }

    const olderIdx = commits.findIndex(c => c.hash === olderPick.label);
    const newerCommits = commits.slice(0, olderIdx);
    if (newerCommits.length === 0) {
        vscode.window.showWarningMessage('No newer commits available.');
        return;
    }

    const newerPick = await vscode.window.showQuickPick(
        toPickItems(newerCommits),
        { placeHolder: 'Select newer commit', matchOnDetail: true }
    );
    if (!newerPick) {
        return;
    }

    const lastExtensions = context.workspaceState.get<string>(KEY_EXTENSIONS, '');
    const extensionsInput = await vscode.window.showInputBox({
        prompt: 'File extension filter (optional, space/comma separated)',
        placeHolder: lastExtensions || 'e.g. vue js xml (leave empty for all)',
    });
    if (extensionsInput === undefined) {
        return;
    }
    if (extensionsInput.trim()) {
        await context.workspaceState.update(KEY_EXTENSIONS, extensionsInput.trim());
    }

    const zipPick = await vscode.window.showQuickPick(
        [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
        ],
        { placeHolder: 'Export as zip?' }
    );
    if (!zipPick) {
        return;
    }

    const lastOutputDir = context.workspaceState.get<string>(KEY_OUTPUT_DIR, '');
    const outputUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Output Directory',
        defaultUri: lastOutputDir ? vscode.Uri.file(lastOutputDir) : undefined,
    });
    if (!outputUri || outputUri.length === 0) {
        return;
    }
    const outputDir = outputUri[0].fsPath;
    await context.workspaceState.update(KEY_OUTPUT_DIR, outputDir);

    const olderHash = olderPick.label;
    const newerHash = newerPick.label;

    const diffResult = await runGit(
        ['diff', '--name-only', '--diff-filter=ACMR', `${olderHash}..${newerHash}`],
        repoRoot
    );
    if (diffResult.exitCode !== 0) {
        vscode.window.showErrorMessage(`Failed to get diff: ${diffResult.stdout}`);
        return;
    }

    let files = diffResult.stdout.split('\n').filter(Boolean);

    if (extensionsInput.trim()) {
        const extensions = extensionsInput
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(ext => (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
        files = files.filter(f => extensions.includes(path.extname(f).toLowerCase()));
    }

    if (files.length === 0) {
        vscode.window.showInformationMessage('No changed files match the filter.');
        return;
    }

    const projectName = path.basename(repoRoot);
    const baseName = `${projectName}-${olderHash.substring(0, 7)}-${newerHash.substring(0, 7)}`;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting changed files...' },
        async (progress) => {
            if (zipPick.value) {
                const zipPath = path.join(outputDir, `${baseName}.zip`);
                const zipFile = new yazl.ZipFile();
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    progress.report({ message: file, increment: (100 / files.length) });
                    const contentResult = await runGit(['show', `${newerHash}:${file}`], repoRoot);
                    if (contentResult.exitCode === 0) {
                        zipFile.addBuffer(Buffer.from(contentResult.stdout), file);
                    }
                }
                zipFile.end();
                await new Promise<void>((resolve, reject) => {
                    const writeStream = fs.createWriteStream(zipPath);
                    zipFile.outputStream.pipe(writeStream);
                    writeStream.on('close', resolve);
                    writeStream.on('error', reject);
                });
            } else {
                const destDir = path.join(outputDir, baseName);
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    progress.report({ message: file, increment: (100 / files.length) });
                    const contentResult = await runGit(['show', `${newerHash}:${file}`], repoRoot);
                    if (contentResult.exitCode === 0) {
                        const destPath = path.join(destDir, file);
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, contentResult.stdout);
                    }
                }
            }
        }
    );

    const outputPath = zipPick.value
        ? path.join(outputDir, `${baseName}.zip`)
        : path.join(outputDir, baseName);

    const action = await vscode.window.showInformationMessage(
        `Exported ${files.length} file(s) to ${outputPath}.`,
        'Reveal in File Explorer'
    );
    if (action === 'Reveal in File Explorer') {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
    }
}
