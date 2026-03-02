// test_scaffold skill — identifies testable entry points and generates test file templates

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, dirname, extname } from "node:path";
import type { Skill } from "./index.js";

export interface TestScaffoldInput {
  repoPath: string;
  filePaths?: string[];
}

export interface TestableEntry {
  name: string;
  type: "function" | "class" | "method" | "endpoint";
  filePath: string;
  line: number;
  signature: string;
  hasExistingTests: boolean;
  existingTestFile?: string;
  priority: "high" | "medium" | "low";
}

export interface TestTemplate {
  testFilePath: string;
  sourceFilePath: string;
  framework: "vitest" | "pytest" | "c-assert";
  content: string;
  entries: string[];
}

export interface TestScaffoldOutput {
  totalEntries: number;
  coveredEntries: number;
  uncoveredEntries: number;
  coveragePercentage: number;
  entries: TestableEntry[];
  templates: TestTemplate[];
  confidence: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "__pycache__", ".next", "build"]);

type Lang = "typescript" | "python" | "c";

function detectLanguage(filePath: string): Lang | null {
  const ext = extname(filePath);
  if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".h") return "c";
  return null;
}

function isTestFile(filePath: string): boolean {
  const base = basename(filePath);
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    base.startsWith("test_") ||
    base.endsWith("_test.py")
  );
}

function findTestFile(filePath: string, allFiles: string[]): string | undefined {
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const dir = dirname(filePath);

  const candidates: string[] = [];

  if (ext === ".py") {
    candidates.push(join(dir, `test_${base}.py`));
    candidates.push(join(dir, "__tests__", `test_${base}.py`));
  } else if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
    candidates.push(join(dir, `${base}.test${ext}`));
    candidates.push(join(dir, `${base}.spec${ext}`));
    candidates.push(join(dir, "__tests__", `${base}.test${ext}`));
    candidates.push(join(dir, "__tests__", `${base}.spec${ext}`));
  } else if (ext === ".h") {
    candidates.push(join(dir, `test_${base}.c`));
    candidates.push(join(dir, "tests", `test_${base}.c`));
  }

  // Normalise separators for matching
  const norm = (p: string) => p.replace(/\\/g, "/");
  return allFiles.find((f) => candidates.some((c) => norm(f) === norm(c)));
}

// --- Parsers for extractable entries ---

interface RawEntry {
  name: string;
  type: TestableEntry["type"];
  line: number;
  signature: string;
  exported: boolean;
}

function parseTypeScript(content: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // export function foo(...)
    const fnMatch = trimmed.match(/^export\s+(async\s+)?function\s+(\w+)\s*(\([^)]*\))/);
    if (fnMatch) {
      entries.push({
        name: fnMatch[2],
        type: "function",
        line: i + 1,
        signature: `function ${fnMatch[2]}${fnMatch[3]}`,
        exported: true,
      });
      continue;
    }

    // export class Foo
    const classMatch = trimmed.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      entries.push({
        name: classMatch[1],
        type: "class",
        line: i + 1,
        signature: `class ${classMatch[1]}`,
        exported: true,
      });
      continue;
    }

    // export const foo = ...
    const constMatch = trimmed.match(/^export\s+const\s+(\w+)\s*=/);
    if (constMatch) {
      entries.push({
        name: constMatch[1],
        type: "function",
        line: i + 1,
        signature: `const ${constMatch[1]}`,
        exported: true,
      });
      continue;
    }
  }

  return entries;
}

function parsePython(content: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Module-level def (no leading whitespace)
    const defMatch = line.match(/^def\s+(\w+)\s*(\([^)]*\))/);
    if (defMatch) {
      entries.push({
        name: defMatch[1],
        type: "function",
        line: i + 1,
        signature: `def ${defMatch[1]}${defMatch[2]}`,
        exported: !defMatch[1].startsWith("_"),
      });
      continue;
    }

    // Module-level class
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      entries.push({
        name: classMatch[1],
        type: "class",
        line: i + 1,
        signature: `class ${classMatch[1]}`,
        exported: !classMatch[1].startsWith("_"),
      });
      continue;
    }
  }

  return entries;
}

function parseCHeader(content: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Function declarations: return_type name(params);
    const fnMatch = line.match(
      /^(?:extern\s+)?(\w[\w\s*]*?)\s+(\w+)\s*(\([^)]*\))\s*;/,
    );
    if (fnMatch && !line.startsWith("#") && !line.startsWith("typedef")) {
      entries.push({
        name: fnMatch[2],
        type: "function",
        line: i + 1,
        signature: `${fnMatch[1]} ${fnMatch[2]}${fnMatch[3]}`,
        exported: true,
      });
    }
  }

  return entries;
}

// --- Template generators ---

function generateVitestTemplate(
  sourceFile: string,
  entries: RawEntry[],
): string {
  const importNames = entries.map((e) => e.name).join(", ");
  const relPath = sourceFile.replace(/\\/g, "/");
  const lines = [
    `import { describe, it, expect } from "vitest";`,
    `import { ${importNames} } from "./${relPath.replace(/\.tsx?$/, ".js")}";`,
    ``,
    `describe("${basename(sourceFile, extname(sourceFile))}", () => {`,
  ];

  for (const entry of entries) {
    lines.push(`  it("should handle ${entry.name}", () => {`);
    lines.push(`    // TODO: test ${entry.signature}`);
    lines.push(`    expect(true).toBe(true);`);
    lines.push(`  });`);
    lines.push(``);
  }

  lines.push(`});`);
  lines.push(``);
  return lines.join("\n");
}

function generatePytestTemplate(
  sourceFile: string,
  entries: RawEntry[],
): string {
  const moduleName = basename(sourceFile, ".py");
  const lines = [
    `import pytest`,
    `from ${moduleName} import ${entries.map((e) => e.name).join(", ")}`,
    ``,
  ];

  for (const entry of entries) {
    lines.push(`def test_${entry.name}():`);
    lines.push(`    # TODO: test ${entry.signature}`);
    lines.push(`    assert True`);
    lines.push(``);
  }

  return lines.join("\n");
}

function generateCAssertTemplate(
  sourceFile: string,
  entries: RawEntry[],
): string {
  const headerName = basename(sourceFile);
  const lines = [
    `#include <assert.h>`,
    `#include "${headerName}"`,
    ``,
  ];

  for (const entry of entries) {
    lines.push(`void test_${entry.name}(void) {`);
    lines.push(`    /* TODO: test ${entry.signature} */`);
    lines.push(`    assert(1);`);
    lines.push(`}`);
    lines.push(``);
  }

  lines.push(`int main(void) {`);
  for (const entry of entries) {
    lines.push(`    test_${entry.name}();`);
  }
  lines.push(`    return 0;`);
  lines.push(`}`);
  lines.push(``);
  return lines.join("\n");
}

// --- Directory walking ---

async function walkDir(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  let items: string[];
  try {
    items = await readdir(dir);
  } catch {
    return results;
  }

  for (const item of items) {
    if (SKIP_DIRS.has(item)) continue;
    const full = join(dir, item);
    const s = await stat(full);
    if (s.isDirectory()) {
      results.push(...(await walkDir(full, root)));
    } else {
      // Store paths relative to root
      const rel = full.slice(root.length).replace(/^[\\/]/, "");
      results.push(rel);
    }
  }
  return results;
}

export class TestScaffoldSkill implements Skill {
  readonly name = "test_scaffold";

  async execute(context: unknown): Promise<TestScaffoldOutput> {
    const input = context as TestScaffoldInput;
    const { repoPath, filePaths } = input;

    // Collect all files
    const allFiles = await walkDir(repoPath, repoPath);

    // Determine which source files to analyse
    let sourceFiles: string[];
    if (filePaths && filePaths.length > 0) {
      sourceFiles = filePaths.filter((f) => !isTestFile(f));
    } else {
      sourceFiles = allFiles.filter((f) => {
        const lang = detectLanguage(f);
        return lang !== null && !isTestFile(f);
      });
    }

    const entries: TestableEntry[] = [];
    // Group entries per source file for template generation
    const fileEntries = new Map<string, { raw: RawEntry[]; lang: Lang }>();

    for (const filePath of sourceFiles) {
      const lang = detectLanguage(filePath);
      if (!lang) continue;

      let content: string;
      try {
        content = await readFile(join(repoPath, filePath), "utf-8");
      } catch {
        continue;
      }

      let rawEntries: RawEntry[];
      switch (lang) {
        case "typescript":
          rawEntries = parseTypeScript(content);
          break;
        case "python":
          rawEntries = parsePython(content);
          break;
        case "c":
          rawEntries = parseCHeader(content);
          break;
      }

      if (rawEntries.length === 0) continue;

      const testFile = findTestFile(filePath, allFiles);
      let testContent: string | null = null;
      if (testFile) {
        try {
          testContent = await readFile(join(repoPath, testFile), "utf-8");
        } catch {
          // ignore
        }
      }

      const fileRaw: RawEntry[] = [];

      for (const raw of rawEntries) {
        const hasExistingTests = testContent !== null && testContent.includes(raw.name);

        let priority: TestableEntry["priority"];
        if (raw.exported && !hasExistingTests) {
          priority = "high";
        } else if (raw.exported && hasExistingTests) {
          priority = "medium";
        } else {
          priority = "low";
        }

        entries.push({
          name: raw.name,
          type: raw.type,
          filePath,
          line: raw.line,
          signature: raw.signature,
          hasExistingTests,
          existingTestFile: testFile,
          priority,
        });

        if (!hasExistingTests) {
          fileRaw.push(raw);
        }
      }

      if (fileRaw.length > 0) {
        fileEntries.set(filePath, { raw: fileRaw, lang });
      }
    }

    // Generate templates for uncovered entries
    const templates: TestTemplate[] = [];
    for (const [srcFile, { raw, lang }] of fileEntries) {
      const ext = extname(srcFile);
      const base = basename(srcFile, ext);
      const dir = dirname(srcFile);
      let testFilePath: string;
      let framework: TestTemplate["framework"];
      let content: string;

      switch (lang) {
        case "typescript":
          testFilePath = join(dir, "__tests__", `${base}.test${ext}`);
          framework = "vitest";
          content = generateVitestTemplate(srcFile, raw);
          break;
        case "python":
          testFilePath = join(dir, `test_${base}.py`);
          framework = "pytest";
          content = generatePytestTemplate(srcFile, raw);
          break;
        case "c":
          testFilePath = join(dir, "tests", `test_${base}.c`);
          framework = "c-assert";
          content = generateCAssertTemplate(srcFile, raw);
          break;
      }

      templates.push({
        testFilePath: testFilePath.replace(/\\/g, "/"),
        sourceFilePath: srcFile.replace(/\\/g, "/"),
        framework,
        content,
        entries: raw.map((e) => e.name),
      });
    }

    const coveredEntries = entries.filter((e) => e.hasExistingTests).length;
    const totalEntries = entries.length;
    const uncoveredEntries = totalEntries - coveredEntries;
    const coveragePercentage =
      totalEntries === 0 ? 100 : Math.round((coveredEntries / totalEntries) * 100);

    return {
      totalEntries,
      coveredEntries,
      uncoveredEntries,
      coveragePercentage,
      entries,
      templates,
      confidence: entries.length > 0 ? 0.85 : 0.5,
    };
  }
}
