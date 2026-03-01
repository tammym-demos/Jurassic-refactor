# Stack Fingerprint

## Overview

Detects the technology stack of a repository by analyzing file presence, file extensions, configuration files, and dependency manifests. Produces a structured inventory of languages, frameworks, build tools, package managers, and runtime dependencies with confidence scores.

## Interfaces

### StackFingerprintInput

```typescript
interface StackFingerprintInput {
  repoPath: string;           // Local path to the repository
}
```

### DetectedItem

```typescript
interface DetectedItem {
  name: string;               // Technology name
  category: "language" | "framework" | "build_tool" | "package_manager" | "runtime";
  version?: string;           // Detected version (if available)
  confidence: number;         // 0.0 - 1.0 confidence score
  evidence: string;           // File or pattern that triggered detection
}
```

### StackFingerprintOutput

```typescript
interface StackFingerprintOutput {
  languages: DetectedItem[];
  frameworks: DetectedItem[];
  buildTools: DetectedItem[];
  packageManagers: DetectedItem[];
  runtimeDependencies: DetectedItem[];
}
```

## Behavior

- Implements the `Skill` interface with `name = "stack_fingerprint"`
- `execute()` walks the directory tree at `repoPath`, skipping `node_modules`, `.git`, `dist`, `__pycache__`, `.next`, `build`
- Returns a `StackFingerprintOutput` with categorized detections

### Language Detection

- Config files provide definitive evidence (confidence 1.0): `tsconfig.json` → TypeScript, `go.mod` → Go, `Cargo.toml` → Rust, `requirements.txt`/`pyproject.toml`/`setup.py` → Python
- File extensions provide weaker evidence (confidence 0.5–0.8): `.ts`/`.tsx` → TypeScript, `.py` → Python, `.go` → Go, `.rs` → Rust, `.c`/`.h` → C, `.cpp`/`.hpp` → C++, `.vue` → Vue.js

### Framework Detection

- Parses `package.json` dependencies and devDependencies for: react, vue, express, next, @angular/core, svelte
- Parses `requirements.txt` for: django, flask, fastapi
- Detects `CMakeLists.txt` as CMake framework

### Build Tool Detection

- Detects by file presence: `Makefile` → Make, `CMakeLists.txt` → CMake, `tsconfig.json` → TypeScript Compiler, `setup.py` → setuptools, `pyproject.toml` → pyproject, `webpack.config.*` → webpack, `vite.config.*` → Vite

### Package Manager Detection

- Lock files provide definitive evidence (confidence 1.0): `package-lock.json` → npm, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `Pipfile` → pipenv, `poetry.lock` → poetry

### Runtime Dependency Detection

- Parses `package.json` `dependencies` field with version strings
- Parses `requirements.txt` entries with optional version specifiers
- Parses `go.mod` `require` blocks with module paths and versions

## Confidence Scoring

| Score | Meaning | Example |
|-------|---------|---------|
| 1.0 | Definitive evidence | Lock file, explicit config file, dependency manifest entry |
| 0.8 | Strong evidence | File extensions combined with config files |
| 0.5 | Weak evidence | Single file extension found, no config |
