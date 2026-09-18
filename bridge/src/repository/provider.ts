export interface FileChange {
  path: string;
  content: Uint8Array;
  ifAbsent?: boolean;
  expectedSha256?: string;
}

export interface CommitResult {
  revision: string;
}

export interface RepositoryProvider {
  readonly kind: string;
  readFile(path: string): Promise<Uint8Array | null>;
  exists(path: string): Promise<boolean>;
  commitFiles(changes: FileChange[], message: string): Promise<CommitResult>;
}
