// ADR: docs/adr/bridge/0001-system-boundaries.md — repository access belongs behind the Bridge boundary, never on the headset.
// ADR: docs/adr/contracts/0010-repository-layout-profile.md — repository storage is a backend profile, not a protocol contract.
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
  probe(): Promise<{ ready: boolean; detail?: string }>;
  commitFiles(changes: FileChange[], message: string): Promise<CommitResult>;
}
