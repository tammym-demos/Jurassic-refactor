# Test Scaffold

## Overview

Identifies testable entry points in a repository (exported functions, classes, API endpoints) and generates test file templates with priority ranking. Scans source files across TypeScript, Python, and C, maps existing test coverage, and produces a structured scaffold output.

## Interfaces

### TestScaffoldInput

```typescript
interface TestScaffoldInput {
  repoPath: string;       // Local path to the repository
  filePaths?: string[];   // Optional subset of files to analyse
}
```

### TestableEntry

```typescript
interface TestableEntry {
  name: string;                              // Entry point name
  type: "function" | "class" | "method" | "endpoint"; // Kind of entry
  filePath: string;                          // Source file (relative)
  line: number;                              // Line number in source
  signature: string;                         // Parsed signature
  hasExistingTests: boolean;                 // Whether tests already exist
  existingTestFile?: string;                 // Path to existing test file
  priority: "high" | "medium" | "low";       // Test priority
}
```

### TestTemplate

```typescript
interface TestTemplate {
  testFilePath: string;                      // Suggested test file path
  sourceFilePath: string;                    // Source file being tested
  framework: "vitest" | "pytest" | "c-assert"; // Test framework
  content: string;                           // Generated test file content
  entries: string[];                         // Names of functions being tested
}
```

### TestScaffoldOutput

```typescript
interface TestScaffoldOutput {
  totalEntries: number;        // Total testable entry points found
  coveredEntries: number;      // Entries with existing tests
  uncoveredEntries: number;    // Entries without tests
  coveragePercentage: number;  // Rounded coverage percentage
  entries: TestableEntry[];    // All discovered entries
  templates: TestTemplate[];   // Generated test templates
}
```

## Behavior

- Implements the `Skill` interface with `name = "test_scaffold"`
- `execute()` walks the directory tree at `repoPath` using recursive directory reads
- Skips common directories: `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`
- If `filePaths` is provided, only analyses those files (excluding test files)
- Detects language from file extension (`.ts`/`.tsx`/`.js`/`.jsx` → TypeScript, `.py` → Python, `.h` → C)

### Entry Detection

- **TypeScript**: `export function`, `export class`, `export const`
- **Python**: module-level `def` and `class` (no leading whitespace)
- **C**: function declarations in `.h` header files

### Test Coverage Mapping

- Locates corresponding test files using naming conventions:
  - TypeScript: `foo.test.ts`, `foo.spec.ts`, or `__tests__/foo.test.ts`
  - Python: `test_foo.py` or `__tests__/test_foo.py`
  - C: `test_foo.c` or `tests/test_foo.c`
- If a test file exists, checks whether each entry name appears in the test content

### Priority Assignment

- **high**: exported entry with no existing tests
- **medium**: exported entry with existing tests (partial coverage)
- **low**: internal (non-exported) entry with no tests

### Template Generation

- Generates test templates only for uncovered entries
- Uses the appropriate framework per language:
  - TypeScript → vitest
  - Python → pytest
  - C → c-assert
- Each template includes stub test cases for each uncovered entry

### Coverage Calculation

- `coveragePercentage = round(coveredEntries / totalEntries * 100)`
- Returns 100% when there are no entries (empty repository)
