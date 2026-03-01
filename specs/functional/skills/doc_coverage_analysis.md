# Doc Coverage Analysis

## Overview

Analyzes documentation coverage across a codebase. Scans for undocumented public APIs, missing READMEs, and stale comments. Produces coverage percentages, a gap list, and generates documentation stub templates.

## Interfaces

### DocCoverageInput

```typescript
interface DocCoverageInput {
  repoPath: string;       // Local path to the repository
  filePaths?: string[];   // Optional subset of files to analyze
}
```

### DocCoverageOutput

```typescript
interface DocCoverageOutput {
  totalPublicAPIs: number;    // Total public API symbols found
  documentedAPIs: number;     // Number with doc comments
  overallPercentage: number;  // documented / total * 100
  missingReadmes: string[];   // Directories without README.md
  gaps: DocGap[];             // Undocumented symbols
  stubs: Array<{ filePath: string; content: string }>;  // Generated doc stubs
}
```

### PublicAPI

```typescript
interface PublicAPI {
  name: string;
  type: "function" | "class" | "interface" | "type" | "variable" | "method";
  filePath: string;
  line: number;
  hasDocComment: boolean;
  docComment?: string;
}
```

### DocGap

```typescript
interface DocGap {
  filePath: string;
  symbol: string;
  type: string;
  line: number;
  stub: string;   // Generated doc stub template
}
```

## Behavior

- Implements the `Skill` interface with `name = "doc_coverage_analysis"`
- `execute()` walks the directory tree at `repoPath` or scans the provided `filePaths`
- Skips common directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`

### Language Support

- **TypeScript/JavaScript** (`.ts`, `.tsx`, `.js`, `.jsx`): Detects `export function`, `export async function`, `export class`, `export interface`, `export type`, `export const`, `export let`. Checks for preceding `/** ... */` JSDoc comments.
- **Python** (`.py`): Detects module-level `def` and `class` declarations (non-indented). Checks for preceding `""" ... """` docstrings.
- **C/C++** (`.h`, `.hpp`): Detects function declarations in header files. Checks for preceding `/* ... */` comments.

### Missing README Detection

- Walks all directories (excluding skipped ones) and reports directories without a `README.md` file.

### Stub Generation

- For undocumented symbols, generates language-appropriate doc comment stubs
- TypeScript/JavaScript: `/** symbol - TODO: Add description. */` (with `@param`/`@returns` for functions)
- Python: `"""symbol - TODO: Add description."""`
- C/C++: `/* symbol - TODO: Add description. */`

### Coverage Calculation

- `overallPercentage = documented / total * 100`
- Returns `0` when no public APIs are found (empty directory)
