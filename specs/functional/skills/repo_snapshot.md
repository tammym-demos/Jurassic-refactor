# Repo Snapshot

## Overview

Snapshots a repository's file structure for analysis. Walks the directory tree, collects file metadata, and returns a structured index of all files.

## Interfaces

### RepoSnapshotInput

```typescript
interface RepoSnapshotInput {
  repoPath: string;          // Local path to the repository
  forkOwner?: string;        // GitHub fork owner (optional)
  commitSha?: string;        // Pin to specific commit (optional)
  mode?: 'full' | 'doc-coverage'; // Analysis mode
}
```

### RepoSnapshotOutput

```typescript
interface RepoSnapshotOutput {
  commitSha: string;          // Current HEAD SHA
  forkUrl?: string;           // Computed fork URL
  totalFiles: number;         // Total file count
  fileIndex: FileEntry[];     // File listing with metadata
}
```

### FileEntry

```typescript
interface FileEntry {
  path: string;               // Relative file path
  extension: string;          // File extension
  sizeBytes: number;          // File size
  language?: string;          // Detected language (from extension)
}
```

## Behavior

- Implements the `Skill` interface with `name = "repo_snapshot"`
- `execute()` walks the directory tree at `repoPath` using recursive directory reads
- Skips common directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`
- Maps file extensions to languages (`.ts` → TypeScript, `.py` → Python, `.c`/`.h` → C, `.js` → JavaScript, `.vue` → Vue, etc.)
- If `forkOwner` is provided, computes fork URL as `https://github.com/${forkOwner}/<repoName>`
- If `commitSha` is provided, stores it; otherwise uses `"HEAD"`
- Returns the `RepoSnapshotOutput` structure

## Modes

- `full` (default): Index all files in the repository
- `doc-coverage`: Index all files (same walk), allowing downstream consumers to analyze documentation coverage
