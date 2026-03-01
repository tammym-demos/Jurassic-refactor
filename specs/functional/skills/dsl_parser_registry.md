# DSL Parser Registry

## Overview

An extensible registry for proprietary DSL (Domain-Specific Language) parsers that extract imports, exports, and symbols from source files.

## Interfaces

### ParseResult

```typescript
interface ParseResult {
  imports: ImportEntry[];
  exports: ExportEntry[];
  symbols: SymbolEntry[];
}
```

### ImportEntry

```typescript
interface ImportEntry {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}
```

### ExportEntry

```typescript
interface ExportEntry {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
}
```

### SymbolEntry

```typescript
interface SymbolEntry {
  name: string;
  type: string;
  line: number;
}
```

### DslParser

```typescript
interface DslParser {
  name: string;
  fileExtensions: string[];
  parse(content: string, filePath: string): ParseResult;
}
```

## Default Parsers

### C/C++ Includes Parser

- Extensions: `.c`, `.h`, `.cpp`, `.hpp`
- Parses `#include "..."` as local imports
- Parses `#include <...>` as system imports

### Python Imports Parser

- Extensions: `.py`
- Parses `import X`
- Parses `from X import Y, Z`
- Parses `from X import *`

### JS/Vue Imports Parser

- Extensions: `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`
- Parses `import ... from '...'`
- Parses `require('...')`
- Parses `export function`, `export class`, `export const`, `export type`, `export default`

## Registry

### DslParserRegistry

- `register(parser: DslParser): void` — register a parser
- `getParser(filePath: string): DslParser | undefined` — find parser by file extension
- `parse(content: string, filePath: string): ParseResult` — parse using the appropriate parser
- `listParsers(): DslParser[]` — list all registered parsers
- `registerPlugin(parser: DslParser): void` — register an enterprise plugin parser
- Constructor registers all default parsers automatically
