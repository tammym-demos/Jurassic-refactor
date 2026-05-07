import * as fs from "node:fs";
import * as path from "node:path";
import type { Skill } from "./index.js";

export interface ComplexityMetricsInput {
  repoPath: string;
  filePaths?: string[];
}

export interface FunctionMetrics {
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  loc: number;
  cyclomaticComplexity: number;
  maxNestingDepth: number;
}

export interface FileMetrics {
  filePath: string;
  loc: number;
  blankLines: number;
  commentLines: number;
  functions: FunctionMetrics[];
  avgCyclomaticComplexity: number;
  maxNestingDepth: number;
}

export interface ComplexityMetricsOutput {
  totalFiles: number;
  totalLoc: number;
  files: FileMetrics[];
  hotspots: FunctionMetrics[];
  confidence: number;
}

const SUPPORTED_EXTENSIONS = new Set([".ts", ".js", ".py", ".c", ".cpp", ".h"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "__pycache__",
  ".next",
  "build",
]);

// Regex patterns for function declarations per language family
const FUNCTION_PATTERNS: Record<string, RegExp[]> = {
  braceLanguage: [
    // JS/TS: function declarations, arrow functions assigned to const/let/var, methods
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/,
    // C/C++: type name(params) {
    /^\s*(?:\w+[\s*&]+)+(\w+)\s*\([^)]*\)\s*\{?\s*$/,
  ],
  python: [
    /^\s*(?:async\s+)?def\s+(\w+)/,
  ],
};

const KEYWORDS = new Set([
  "if", "else", "while", "for", "switch", "case", "return",
  "do", "try", "catch", "finally", "throw", "new", "delete",
  "typeof", "instanceof", "void", "class", "import", "export",
]);

function _isBraceLanguage(ext: string): boolean {
  return [".ts", ".js", ".c", ".cpp", ".h"].includes(ext);
}

function isPython(ext: string): boolean {
  return ext === ".py";
}

function countCommentLines(lines: string[], ext: string): number {
  let count = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (isPython(ext)) {
      if (trimmed.startsWith("#")) {
        count++;
      }
    } else {
      if (inBlockComment) {
        count++;
        if (trimmed.includes("*/")) {
          inBlockComment = false;
        }
      } else if (trimmed.startsWith("//")) {
        count++;
      } else if (trimmed.startsWith("/*")) {
        count++;
        inBlockComment = true;
        if (trimmed.includes("*/")) {
          inBlockComment = false;
        }
      }
    }
  }

  return count;
}

function computeCyclomaticComplexity(lines: string[], ext: string): number {
  // Base complexity is 1
  let complexity = 1;
  const code = lines.join("\n");

  if (isPython(ext)) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(if|elif|while|for)\s/.test(trimmed)) complexity++;
      if (/\band\b/.test(trimmed)) complexity += (trimmed.match(/\band\b/g) || []).length;
      if (/\bor\b/.test(trimmed)) complexity += (trimmed.match(/\bor\b/g) || []).length;
      if (/\bif\b/.test(trimmed) && /\belse\b/.test(trimmed) && !trimmed.startsWith("if") && !trimmed.startsWith("elif")) {
        // inline ternary: x if cond else y - already counted the if
      }
    }
  } else {
    // Brace languages: count decision points
    // Use regex on full code to avoid double-counting across lines
    const ifMatches = code.match(/\bif\s*\(/g) || [];
    const elseIfMatches = code.match(/\belse\s+if\s*\(/g) || [];
    const whileMatches = code.match(/\bwhile\s*\(/g) || [];
    const forMatches = code.match(/\bfor\s*\(/g) || [];
    const caseMatches = code.match(/\bcase\s+/g) || [];
    const andMatches = code.match(/&&/g) || [];
    const orMatches = code.match(/\|\|/g) || [];
    const ternaryMatches = code.match(/\?(?!=)/g) || [];

    complexity +=
      ifMatches.length +
      elseIfMatches.length +
      whileMatches.length +
      forMatches.length +
      caseMatches.length +
      andMatches.length +
      orMatches.length +
      ternaryMatches.length;

    // else if is counted both as if and else if; remove the double count
    complexity -= elseIfMatches.length;
  }

  return complexity;
}

function computeMaxNestingDepth(lines: string[], ext: string): number {
  let maxDepth = 0;

  if (isPython(ext)) {
    // Use indentation level
    for (const line of lines) {
      if (line.trim() === "") continue;
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || "";
      // Assume 4-space or tab indentation
      const tabCount = (leadingSpaces.match(/\t/g) || []).length;
      const spaceCount = (leadingSpaces.match(/ /g) || []).length;
      const depth = tabCount + Math.floor(spaceCount / 4);
      if (depth > maxDepth) maxDepth = depth;
    }
  } else {
    // Brace languages: track brace depth
    let depth = 0;
    for (const line of lines) {
      for (const ch of line) {
        if (ch === "{") {
          depth++;
          if (depth > maxDepth) maxDepth = depth;
        } else if (ch === "}") {
          depth--;
        }
      }
    }
  }

  return maxDepth;
}

interface FunctionBoundary {
  name: string;
  lineStart: number;
  lineEnd: number;
}

function extractFunctions(lines: string[], ext: string): FunctionBoundary[] {
  const functions: FunctionBoundary[] = [];
  const patterns = isPython(ext)
    ? FUNCTION_PATTERNS.python
    : FUNCTION_PATTERNS.braceLanguage;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1] && !KEYWORDS.has(match[1])) {
        const name = match[1];
        const lineStart = i + 1; // 1-based
        let lineEnd: number;

        if (isPython(ext)) {
          lineEnd = findPythonFunctionEnd(lines, i);
        } else {
          lineEnd = findBraceFunctionEnd(lines, i);
        }

        // Avoid duplicate function entries at the same line
        if (!functions.some((f) => f.lineStart === lineStart)) {
          functions.push({ name, lineStart, lineEnd });
        }
        break;
      }
    }
  }

  return functions;
}

function findPythonFunctionEnd(lines: string[], startIdx: number): number {
  const defLine = lines[startIdx];
  const baseIndent = defLine.match(/^(\s*)/)?.[1]?.length ?? 0;

  let lastBodyLine = startIdx;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (indent <= baseIndent) {
      break;
    }
    lastBodyLine = i;
  }

  return lastBodyLine + 1; // 1-based
}

function findBraceFunctionEnd(lines: string[], startIdx: number): number {
  let braceDepth = 0;
  let foundOpenBrace = false;

  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        braceDepth++;
        foundOpenBrace = true;
      } else if (ch === "}") {
        braceDepth--;
        if (foundOpenBrace && braceDepth === 0) {
          return i + 1; // 1-based
        }
      }
    }
  }

  return lines.length; // fallback to end of file
}

function analyzeFile(
  filePath: string,
  relativePath: string,
  ext: string,
): FileMetrics {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const blankLines = lines.filter((l) => l.trim() === "").length;
  const commentLines = countCommentLines(lines, ext);
  const loc = lines.filter((l) => l.trim() !== "").length;

  const functionBoundaries = extractFunctions(lines, ext);

  const functions: FunctionMetrics[] = functionBoundaries.map((fb) => {
    const funcLines = lines.slice(fb.lineStart - 1, fb.lineEnd);
    const funcLoc = funcLines.filter((l) => l.trim() !== "").length;
    const cc = computeCyclomaticComplexity(funcLines, ext);
    const depth = computeMaxNestingDepth(funcLines, ext);

    return {
      name: fb.name,
      filePath: relativePath,
      lineStart: fb.lineStart,
      lineEnd: fb.lineEnd,
      loc: funcLoc,
      cyclomaticComplexity: cc,
      maxNestingDepth: depth,
    };
  });

  const avgCyclomaticComplexity =
    functions.length > 0
      ? functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) /
        functions.length
      : 0;

  const maxNestingDepth =
    functions.length > 0
      ? Math.max(...functions.map((f) => f.maxNestingDepth))
      : computeMaxNestingDepth(lines, ext);

  return {
    filePath: relativePath,
    loc,
    blankLines,
    commentLines,
    functions,
    avgCyclomaticComplexity,
    maxNestingDepth,
  };
}

function collectFiles(dirPath: string, rootPath: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      files.push(
        ...collectFiles(path.join(dirPath, item.name), rootPath),
      );
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(path.join(dirPath, item.name));
      }
    }
  }

  return files;
}

export class ComplexityMetricsSkill implements Skill {
  readonly name = "complexity_metrics";

  async execute(context: unknown): Promise<ComplexityMetricsOutput> {
    const input = context as ComplexityMetricsInput;
    const repoPath = path.resolve(input.repoPath);

    let filePaths: string[];

    if (input.filePaths && input.filePaths.length > 0) {
      filePaths = input.filePaths.map((fp) => path.resolve(repoPath, fp));
    } else {
      filePaths = collectFiles(repoPath, repoPath);
    }

    const files: FileMetrics[] = [];

    for (const fp of filePaths) {
      const ext = path.extname(fp);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      if (!fs.existsSync(fp)) continue;

      const relativePath = path.relative(repoPath, fp).replace(/\\/g, "/");
      files.push(analyzeFile(fp, relativePath, ext));
    }

    const totalLoc = files.reduce((sum, f) => sum + f.loc, 0);

    // Collect all functions and sort by complexity descending for hotspots
    const allFunctions = files.flatMap((f) => f.functions);
    const hotspots = [...allFunctions]
      .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
      .slice(0, 10);

    return {
      totalFiles: files.length,
      totalLoc,
      files,
      hotspots,
      confidence: files.length > 0 ? 0.9 : 0.5,
    };
  }
}
