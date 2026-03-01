# Git Churn Skill

## Overview

Analyzes git commit history to identify hotspot files with high change frequency.

## Interfaces

### GitChurnInput

```typescript
interface GitChurnInput {
  repoPath: string;           // Path to git repository
  maxCommits?: number;        // Max commits to analyze (default: 500)
  sinceDate?: string;         // ISO date to limit history (optional)
}
```

### GitChurnOutput

```typescript
interface GitChurnOutput {
  hotspots: HotspotFile[];
  stats: {
    totalCommits: number;
    totalFilesChanged: number;
    analysisWindow: { from: string; to: string };
  };
}
```

### HotspotFile

```typescript
interface HotspotFile {
  path: string;               // File path
  changeCount: number;        // Number of commits touching this file
  lastChanged: string;        // ISO date of last change
  churnScore: number;         // Normalized score (0-1)
}
```

## Behavior

- Implements `Skill` interface with `name = "git_churn"`
- Uses `git log` to gather commit history and changed files
- Counts how many commits touched each file
- Sorts hotspots by change count descending
- Computes churn score as `changeCount / maxChangeCount` (normalized 0–1)
- Handles repos with no history gracefully (returns empty results)
- Defaults `maxCommits` to 500 when not specified
- Optionally filters commits by `sinceDate`
