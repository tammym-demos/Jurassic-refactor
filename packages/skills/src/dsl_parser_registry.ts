// DSL Parser Registry — extensible registry for language-specific parsers

import { extname } from "node:path";

export interface ImportEntry {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}

export interface ExportEntry {
  name: string;
  type: "function" | "class" | "variable" | "type";
}

export interface SymbolEntry {
  name: string;
  type: string;
  line: number;
}

export interface ParseResult {
  imports: ImportEntry[];
  exports: ExportEntry[];
  symbols: SymbolEntry[];
}

export interface DslParser {
  name: string;
  fileExtensions: string[];
  parse(content: string, filePath: string): ParseResult;
}

// ---------- Default Parsers ----------

const cIncludeParser: DslParser = {
  name: "c-cpp-includes",
  fileExtensions: [".c", ".h", ".cpp", ".hpp"],
  parse(content: string): ParseResult {
    const imports: ImportEntry[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const localMatch = line.match(/^\s*#include\s+"([^"]+)"/);
      if (localMatch) {
        imports.push({ source: localMatch[1], specifiers: [], isDefault: true });
        continue;
      }
      const sysMatch = line.match(/^\s*#include\s+<([^>]+)>/);
      if (sysMatch) {
        imports.push({ source: sysMatch[1], specifiers: [], isDefault: true });
      }
    }
    return { imports, exports: [], symbols: [] };
  },
};

const pythonImportParser: DslParser = {
  name: "python-imports",
  fileExtensions: [".py"],
  parse(content: string): ParseResult {
    const imports: ImportEntry[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const fromMatch = line.match(
        /^\s*from\s+([\w.]+)\s+import\s+(.+)/,
      );
      if (fromMatch) {
        const source = fromMatch[1];
        const specPart = fromMatch[2].trim();
        const specifiers =
          specPart === "*"
            ? ["*"]
            : specPart.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
        imports.push({ source, specifiers, isDefault: false });
        continue;
      }
      const plainMatch = line.match(/^\s*import\s+([\w.]+)/);
      if (plainMatch) {
        imports.push({
          source: plainMatch[1],
          specifiers: [],
          isDefault: true,
        });
      }
    }
    return { imports, exports: [], symbols: [] };
  },
};

const jsVueImportParser: DslParser = {
  name: "js-vue-imports",
  fileExtensions: [".js", ".jsx", ".ts", ".tsx", ".vue"],
  parse(content: string): ParseResult {
    const imports: ImportEntry[] = [];
    const exports: ExportEntry[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // import default from '...'
      const defaultImport = line.match(
        /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (defaultImport) {
        imports.push({
          source: defaultImport[2],
          specifiers: [defaultImport[1]],
          isDefault: true,
        });
        continue;
      }

      // import { a, b } from '...'
      const namedImport = line.match(
        /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/,
      );
      if (namedImport) {
        const specifiers = namedImport[1]
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);
        imports.push({ source: namedImport[2], specifiers, isDefault: false });
        continue;
      }

      // require('...')
      const requireMatch = line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        imports.push({
          source: requireMatch[1],
          specifiers: [],
          isDefault: true,
        });
        continue;
      }

      // export function / class / const / type
      const exportMatch = line.match(
        /^\s*export\s+(default\s+)?(function|class|const|let|var|type)\s+(\w+)/,
      );
      if (exportMatch) {
        const rawType = exportMatch[2];
        const exportType: ExportEntry["type"] =
          rawType === "function"
            ? "function"
            : rawType === "class"
              ? "class"
              : rawType === "type"
                ? "type"
                : "variable";
        exports.push({ name: exportMatch[3], type: exportType });
      }
    }

    return { imports, exports, symbols: [] };
  },
};

// ---------- Registry ----------

export class DslParserRegistry {
  private readonly parsers = new Map<string, DslParser>();

  constructor() {
    this.register(cIncludeParser);
    this.register(pythonImportParser);
    this.register(jsVueImportParser);
  }

  register(parser: DslParser): void {
    for (const ext of parser.fileExtensions) {
      this.parsers.set(ext, parser);
    }
  }

  getParser(filePath: string): DslParser | undefined {
    const ext = extname(filePath).toLowerCase();
    return this.parsers.get(ext);
  }

  parse(content: string, filePath: string): ParseResult {
    const parser = this.getParser(filePath);
    if (!parser) {
      return { imports: [], exports: [], symbols: [] };
    }
    return parser.parse(content, filePath);
  }

  listParsers(): DslParser[] {
    return [...new Set(this.parsers.values())];
  }

  registerPlugin(parser: DslParser): void {
    this.register(parser);
  }
}
