# gui_import_graph

## Overview

Builds a directed import graph from JavaScript/Vue GUI source files by scanning a repository subdirectory, parsing imports with the DSL Parser Registry, and classifying dependencies as local edges or external npm packages.

## Input

```typescript
interface GuiImportGraphInput {
  repoPath: string;          // Path to repository root
  guiDir?: string;           // Subdirectory to scan (default: "GUI")
}
```

## Output

```typescript
interface GuiImportGraphOutput {
  nodes: string[];            // List of JS/Vue file paths (relative to guiDir)
  edges: Array<{ from: string; to: string; specifiers: string[] }>;
  components: string[];       // Detected .vue component file paths
  stats: {
    totalFiles: number;
    totalImports: number;
    componentCount: number;
    externalDeps: string[];   // npm package imports
  };
}
```

## Behaviour

1. Walk `<repoPath>/<guiDir>` recursively for `.js`, `.jsx`, `.ts`, `.tsx`, `.vue` files.
2. Parse each file's content with `DslParserRegistry.parse()`.
3. For each import:
   - If the source starts with `.` or `..`, resolve the relative path against the importing file's directory and record an edge.
   - Otherwise classify the import source as an external npm dependency.
4. Track `.vue` files separately as components.
5. Return the graph with nodes, edges, components, and aggregate stats.

## Edge Resolution

- Relative imports (`./foo`, `../bar`) are resolved to file paths within the scanned directory.
- When the resolved path matches a known node (with or without extension), an edge is created.
- Unresolvable relative imports are silently ignored.

## Skill Interface

- Implements `Skill` with `name = "gui_import_graph"`.
- `execute(context)` accepts `GuiImportGraphInput` and returns `Promise<GuiImportGraphOutput>`.
