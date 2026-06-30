export interface GitResult {
    stdout: string;
    exitCode: number;
}

export interface OutdatedBranch {
    name: string;
    isMerged: boolean;
}
