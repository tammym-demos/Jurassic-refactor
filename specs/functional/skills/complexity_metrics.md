# Complexity Metrics

## Overview

Computes code complexity metrics for a repository or a set of files. Analyzes cyclomatic complexity, lines of code (LOC), nesting depth, and identifies complexity hotspots at both file and function granularity.

## Interfaces

### ComplexityMetricsInput

```typescript
interface ComplexityMetricsInput {
  repoPath: string;       // Local path to the repository
  filePaths?: string[];   // Specific files to analyze (optional; if empty, analyzes all supported files)
}
```

### ComplexityMetricsOutput

```typescript
interface ComplexityMetricsOutput {
  totalFiles: number;         // Number of files analyzed
  totalLoc: number;           // Total non-blank lines across all files
  files: FileMetrics[];       // Per-file metrics
  hotspots: FunctionMetrics[]; // Top 10 functions by cyclomatic complexity
}
```

### FileMetrics

```typescript
interface FileMetrics {
  filePath: string;               // Relative file path
  loc: number;                    // Non-blank lines of code
  blankLines: number;             // Count of blank lines
  commentLines: number;           // Count of comment lines
  functions: FunctionMetrics[];   // Per-function metrics
  avgCyclomaticComplexity: number; // Average complexity across functions
  maxNestingDepth: number;        // Maximum nesting depth in the file
}
```

### FunctionMetrics

```typescript
interface FunctionMetrics {
  name: string;                  // Function name
  filePath: string;              // File containing the function
  lineStart: number;             // Start line (1-based)
  lineEnd: number;               // End line (1-based)
  loc: number;                   // Non-blank lines in the function
  cyclomaticComplexity: number;  // Cyclomatic complexity score
  maxNestingDepth: number;       // Maximum nesting depth in the function
}
```

## Supported Languages

- TypeScript (`.ts`)
- JavaScript (`.js`)
- Python (`.py`)
- C (`.c`, `.h`)
- C++ (`.cpp`)

## Algorithm

### Lines of Code (LOC)
- Count all non-empty (non-blank) lines in the file or function body.

### Comment Lines
- **Brace languages** (`.ts`, `.js`, `.c`, `.cpp`, `.h`): Lines starting with `//` or within `/* ... */` blocks.
- **Python**: Lines starting with `#`.

### Cyclomatic Complexity
- Starts at a base complexity of **1** for each function.
- Increments for each decision point:
  - **Brace languages**: `if(`, `else if(`, `while(`, `for(`, `case `, `&&`, `||`, ternary `?`
  - **Python**: `if`, `elif`, `while`, `for`, `and`, `or`
- `else if` is counted once (not double-counted as both `else if` and `if`).

### Nesting Depth
- **Brace languages**: Tracks `{` and `}` depth; reports the maximum reached.
- **Python**: Measures indentation level (assumes 4-space or tab indentation).

### Function Extraction
- Uses regex patterns to detect function boundaries per language family.
- **Brace languages**: Matches `function` declarations, arrow functions, class methods, and C/C++ function definitions. Function end is determined by matching brace depth.
- **Python**: Matches `def` and `async def`. Function end is determined by indentation returning to the base level.

### Hotspots
- All detected functions across all files are collected.
- Sorted by cyclomatic complexity in descending order.
- The top 10 are returned as hotspots.

## Behavior

- Implements the `Skill` interface with `name = "complexity_metrics"`.
- `execute()` accepts a `ComplexityMetricsInput` context.
- If `filePaths` is provided, only those files are analyzed; otherwise, all supported files under `repoPath` are discovered recursively.
- Skips common directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`.
- Files with unsupported extensions are ignored.
- Returns a `ComplexityMetricsOutput` with per-file metrics, aggregate LOC, and hotspot ranking.
