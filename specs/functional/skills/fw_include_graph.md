# fw_include_graph Skill

## Overview

Builds a directed include graph from C/C++ firmware source files and detects strongly connected components (SCCs) using Tarjan's algorithm. Circular include chains are identified as SCCs with more than one node.

## Input

```typescript
interface FwIncludeGraphInput {
  repoPath: string;          // Path to repository root
  firmwareDir?: string;      // Subdirectory to scan (default: "Firmware")
}
```

## Output

```typescript
interface FwIncludeGraphOutput {
  nodes: string[];            // List of file paths (relative to firmwareDir)
  edges: Array<{ from: string; to: string }>; // Include dependencies
  sccs: string[][];           // Strongly connected components (cycles)
  stats: {
    totalFiles: number;
    totalIncludes: number;
    cycleCount: number;       // Number of SCCs with more than 1 node
  };
}
```

## Behaviour

1. Walk the firmware directory (`repoPath/firmwareDir`) recursively for `.c`, `.h`, `.cpp`, `.hpp` files.
2. Use `DslParserRegistry` to parse each file's `#include` directives.
3. Build a directed graph where each node is a file path and each edge represents an include dependency.
4. Run Tarjan's SCC algorithm to detect circular include chains.
5. Return the full graph structure with SCCs and statistics.

## Tarjan's Algorithm

- Assigns each node an `index` and `lowlink` during depth-first traversal.
- Maintains a stack of visited nodes.
- When `lowlink == index`, the stack is popped to form an SCC.
- SCCs with more than one node indicate circular dependencies.
