import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "./index.js";

export interface DocCoverageInput {
  repoPath: string;
  filePaths?: string[];
}

export interface PublicAPI {
  name: string;
  type: "function" | "class" | "interface" | "type" | "variable" | "method";
  filePath: string;
  line: number;
  hasDocComment: boolean;
  docComment?: string;
}

export interface DocGap {
  filePath: string;
  symbol: string;
  type: string;
  line: number;
  stub: string;
}

export interface DocCoverageOutput {
  totalPublicAPIs: number;
  documentedAPIs: number;
  overallPercentage: number;
  missingReadmes: string[];
  gaps: DocGap[];
  stubs: Array<{ filePath: string; content: string }>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "__pycache__",
  ".next",
  "build",
]);

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PYTHON_EXTENSIONS = new Set([".py"]);
const C_HEADER_EXTENSIONS = new Set([".h", ".hpp"]);

/**
 * Checks whether the lines preceding `lineIndex` contain a doc comment.
 * Returns the doc comment text if found, or undefined.
 */
function findPrecedingDocComment(
  lines: string[],
  lineIndex: number,
  style: "jsdoc" | "python" | "c",
): string | undefined {
  if (lineIndex <= 0) return undefined;

  if (style === "jsdoc") {
    // Look for /** ... */ block ending just before this line
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      // Check if we're inside a JSDoc block
      if (trimmed.endsWith("*/")) {
        // Walk back to find the opening /**
        for (let j = i; j >= 0; j--) {
          if (lines[j].trim().startsWith("/**")) {
            return lines
              .slice(j, i + 1)
              .map((l) => l.trim())
              .join("\n");
          }
        }
        return undefined;
      }
      // If we hit a non-empty, non-comment line, stop
      return undefined;
    }
  } else if (style === "python") {
    // Look for a triple-quote docstring on the line after the def/class,
    // but here we check preceding triple-quote block
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      if (trimmed.endsWith('"""') || trimmed.endsWith("'''")) {
        const quote = trimmed.endsWith('"""') ? '"""' : "'''";
        // Single-line docstring
        if (trimmed.startsWith(quote) && trimmed.length > 6) {
          return trimmed;
        }
        // Multi-line: walk back to find opening
        for (let j = i - 1; j >= 0; j--) {
          if (lines[j].trim().startsWith(quote)) {
            return lines
              .slice(j, i + 1)
              .map((l) => l.trim())
              .join("\n");
          }
        }
        return undefined;
      }
      return undefined;
    }
  } else if (style === "c") {
    // Look for /* ... */ block ending just before this line
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      if (trimmed.endsWith("*/")) {
        for (let j = i; j >= 0; j--) {
          if (lines[j].trim().startsWith("/*")) {
            return lines
              .slice(j, i + 1)
              .map((l) => l.trim())
              .join("\n");
          }
        }
        return undefined;
      }
      return undefined;
    }
  }

  return undefined;
}

function generateStub(
  symbol: string,
  type: string,
  lang: "ts" | "py" | "c",
): string {
  if (lang === "py") {
    return `"""${symbol} - TODO: Add description."""`;
  }
  if (lang === "c") {
    return `/* ${symbol} - TODO: Add description. */`;
  }
  // TS/JS
  if (type === "function" || type === "method") {
    return `/** ${symbol} - TODO: Add description.\n * @param - TODO\n * @returns TODO\n */`;
  }
  return `/** ${symbol} - TODO: Add description. */`;
}

function extractTsJsAPIs(
  content: string,
  filePath: string,
): PublicAPI[] {
  const apis: PublicAPI[] = [];
  const lines = content.split("\n");

  const exportPatterns: Array<{
    regex: RegExp;
    type: PublicAPI["type"];
  }> = [
    { regex: /^export\s+function\s+(\w+)/, type: "function" },
    { regex: /^export\s+async\s+function\s+(\w+)/, type: "function" },
    { regex: /^export\s+class\s+(\w+)/, type: "class" },
    { regex: /^export\s+interface\s+(\w+)/, type: "interface" },
    { regex: /^export\s+type\s+(\w+)/, type: "type" },
    { regex: /^export\s+const\s+(\w+)/, type: "variable" },
    { regex: /^export\s+let\s+(\w+)/, type: "variable" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const { regex, type } of exportPatterns) {
      const match = line.match(regex);
      if (match) {
        const name = match[1];
        const docComment = findPrecedingDocComment(lines, i, "jsdoc");
        apis.push({
          name,
          type,
          filePath,
          line: i + 1,
          hasDocComment: docComment !== undefined,
          ...(docComment ? { docComment } : {}),
        });
        break;
      }
    }
  }

  return apis;
}

function extractPythonAPIs(
  content: string,
  filePath: string,
): PublicAPI[] {
  const apis: PublicAPI[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Module-level definitions only (not indented)
    if (line.startsWith("def ")) {
      const match = line.match(/^def\s+(\w+)/);
      if (match) {
        const docComment = findPrecedingDocComment(lines, i, "python");
        apis.push({
          name: match[1],
          type: "function",
          filePath,
          line: i + 1,
          hasDocComment: docComment !== undefined,
          ...(docComment ? { docComment } : {}),
        });
      }
    } else if (line.startsWith("class ")) {
      const match = line.match(/^class\s+(\w+)/);
      if (match) {
        const docComment = findPrecedingDocComment(lines, i, "python");
        apis.push({
          name: match[1],
          type: "class",
          filePath,
          line: i + 1,
          hasDocComment: docComment !== undefined,
          ...(docComment ? { docComment } : {}),
        });
      }
    }
  }

  return apis;
}

function extractCHeaderAPIs(
  content: string,
  filePath: string,
): PublicAPI[] {
  const apis: PublicAPI[] = [];
  const lines = content.split("\n");

  // Match function declarations in header files
  const funcDeclRegex = /^[\w*\s]+\s+(\w+)\s*\(.*\)\s*;/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip preprocessor directives and blank lines
    if (line.startsWith("#") || line === "") continue;
    const match = line.match(funcDeclRegex);
    if (match) {
      const name = match[1];
      // Skip common non-function keywords
      if (["if", "else", "while", "for", "switch", "return"].includes(name))
        continue;
      const docComment = findPrecedingDocComment(lines, i, "c");
      apis.push({
        name,
        type: "function",
        filePath,
        line: i + 1,
        hasDocComment: docComment !== undefined,
        ...(docComment ? { docComment } : {}),
      });
    }
  }

  return apis;
}

function collectFiles(
  dirPath: string,
  rootPath: string,
  results: string[],
): void {
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      collectFiles(path.join(dirPath, item.name), rootPath, results);
    } else if (item.isFile()) {
      const fullPath = path.join(dirPath, item.name);
      results.push(path.relative(rootPath, fullPath).replace(/\\/g, "/"));
    }
  }
}

function findDirectoriesWithoutReadme(
  dirPath: string,
  rootPath: string,
): string[] {
  const missing: string[] = [];
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return missing;
  }

  const hasReadme = items.some(
    (item) =>
      item.isFile() && item.name.toLowerCase() === "readme.md",
  );

  if (!hasReadme) {
    const rel = path.relative(rootPath, dirPath).replace(/\\/g, "/");
    missing.push(rel || ".");
  }

  for (const item of items) {
    if (item.isDirectory() && !SKIP_DIRS.has(item.name)) {
      missing.push(
        ...findDirectoriesWithoutReadme(
          path.join(dirPath, item.name),
          rootPath,
        ),
      );
    }
  }

  return missing;
}

export class DocCoverageAnalysisSkill implements Skill {
  readonly name = "doc_coverage_analysis";

  async execute(context: unknown): Promise<DocCoverageOutput> {
    const input = context as DocCoverageInput;
    const repoPath = path.resolve(input.repoPath);

    // Collect all files
    const allFiles: string[] = [];
    if (input.filePaths && input.filePaths.length > 0) {
      allFiles.push(...input.filePaths);
    } else {
      collectFiles(repoPath, repoPath, allFiles);
    }

    // Extract public APIs from each file
    const allAPIs: PublicAPI[] = [];
    for (const relPath of allFiles) {
      const fullPath = path.join(repoPath, relPath);
      const ext = path.extname(relPath);
      let content: string;
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      if (TS_JS_EXTENSIONS.has(ext)) {
        allAPIs.push(...extractTsJsAPIs(content, relPath));
      } else if (PYTHON_EXTENSIONS.has(ext)) {
        allAPIs.push(...extractPythonAPIs(content, relPath));
      } else if (C_HEADER_EXTENSIONS.has(ext)) {
        allAPIs.push(...extractCHeaderAPIs(content, relPath));
      }
    }

    // Find missing READMEs
    const missingReadmes = findDirectoriesWithoutReadme(repoPath, repoPath);

    // Compute gaps and stubs
    const gaps: DocGap[] = [];
    const stubsByFile = new Map<string, string[]>();

    for (const api of allAPIs) {
      if (!api.hasDocComment) {
        const lang = PYTHON_EXTENSIONS.has(path.extname(api.filePath))
          ? "py"
          : C_HEADER_EXTENSIONS.has(path.extname(api.filePath))
            ? "c"
            : "ts";
        const stub = generateStub(api.name, api.type, lang);
        gaps.push({
          filePath: api.filePath,
          symbol: api.name,
          type: api.type,
          line: api.line,
          stub,
        });

        if (!stubsByFile.has(api.filePath)) {
          stubsByFile.set(api.filePath, []);
        }
        stubsByFile.get(api.filePath)!.push(stub);
      }
    }

    const stubs = Array.from(stubsByFile.entries()).map(
      ([filePath, contents]) => ({
        filePath,
        content: contents.join("\n\n"),
      }),
    );

    const totalPublicAPIs = allAPIs.length;
    const documentedAPIs = allAPIs.filter((a) => a.hasDocComment).length;
    const overallPercentage =
      totalPublicAPIs === 0
        ? 0
        : Math.round((documentedAPIs / totalPublicAPIs) * 10000) / 100;

    return {
      totalPublicAPIs,
      documentedAPIs,
      overallPercentage,
      missingReadmes,
      gaps,
      stubs,
    };
  }
}
