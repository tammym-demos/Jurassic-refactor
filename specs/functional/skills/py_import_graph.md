# py_import_graph

## Overview

Builds a directed import graph from Python source files using the DSL Parser Registry.

## Input

```typescript
interface PyImportGraphInput {
  repoPath: string;          // Path to repository root
  pythonDir?: string;         // Subdirectory to scan (default: "tools")
}
```

## Output

```typescript
interface PyImportGraphOutput {
  nodes: string[];            // List of Python file paths (relative to scan dir)
  edges: Array<{ from: string; to: string; specifiers: string[] }>;
  stats: {
    totalFiles: number;
    totalImports: number;
    externalDeps: string[];   // Imports that are not local files
  };
}
```

## Behavior

1. Walk the `pythonDir` (default `"tools"`) under `repoPath` for `.py` files.
2. Use `DslParserRegistry` to parse each file's imports.
3. For each import, attempt to resolve it to a local file:
   - `from utils import x` → look for `utils.py` or `utils/__init__.py` in the scan directory.
   - If not resolvable, classify as an external dependency.
4. Build a directed graph: edges point from the importing file to the imported file.
5. Collect external dependencies (packages not found locally).

## Examples

Given:
- `tools/main.py`: `import os` + `from utils import helper`
- `tools/utils.py`: `from pathlib import Path`

Output nodes: `["main.py", "utils.py"]`
Output edges: `[{ from: "main.py", to: "utils.py", specifiers: ["helper"] }]`
External deps: `["os", "pathlib"]`
