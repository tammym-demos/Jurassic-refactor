// test_writer skill — generates test scaffolds for changed code

import { dirname, basename, extname, join } from "node:path";
import type { Skill } from "./index.js";

export interface TestWriterInput {
  repoPath: string;
  changedFiles: Array<{
    filePath: string;
    language: "typescript" | "python" | "c";
    entryPoints: Array<{
      name: string;
      type: "function" | "endpoint" | "class";
    }>;
  }>;
  riskScores?: Record<string, number>;
}

export interface TestWriterOutput {
  testFiles: Array<{
    filePath: string;
    targetFile: string;
    entryPoints: Array<{ name: string; type: "function" | "endpoint" | "class" }>;
    priority: "high" | "medium" | "low";
    template: string;
  }>;
}

function computeTestFilePath(filePath: string, language: string): string {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const base = basename(filePath, ext);
  const testExt = language === "python" ? ".py" : language === "c" ? ".c" : ext;
  return join(dir, "__tests__", `${base}.test${testExt}`);
}

function computePriority(
  filePath: string,
  riskScores?: Record<string, number>,
): "high" | "medium" | "low" {
  if (!riskScores || riskScores[filePath] === undefined) return "medium";
  const score = riskScores[filePath];
  if (score >= 0.7) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

function generateTemplate(
  language: string,
  targetFile: string,
  entryPoints: Array<{ name: string; type: "function" | "endpoint" | "class" }>,
): string {
  if (language === "typescript") {
    const imports = entryPoints.map((ep) => ep.name).join(", ");
    const blocks = entryPoints
      .map(
        (ep) =>
          `  describe('${ep.name}', () => {\n    it('should work correctly', () => {\n      // TODO: implement test for ${ep.name}\n    });\n  });`,
      )
      .join("\n\n");
    return `import { describe, it, expect } from 'vitest';\nimport { ${imports} } from '${targetFile}';\n\ndescribe('${basename(targetFile)}', () => {\n${blocks}\n});\n`;
  }

  if (language === "python") {
    const imports = entryPoints.map((ep) => ep.name).join(", ");
    const funcs = entryPoints
      .map(
        (ep) =>
          `def test_${ep.name}():\n    # TODO: implement test for ${ep.name}\n    assert True`,
      )
      .join("\n\n");
    return `from ${basename(targetFile, extname(targetFile))} import ${imports}\n\n${funcs}\n`;
  }

  // C
  const includes = `#include <assert.h>\n#include "${targetFile}"`;
  const tests = entryPoints
    .map(
      (ep) =>
        `void test_${ep.name}(void) {\n    // TODO: implement test for ${ep.name}\n    assert(1);\n}`,
    )
    .join("\n\n");
  const calls = entryPoints.map((ep) => `    test_${ep.name}();`).join("\n");
  return `${includes}\n\n${tests}\n\nint main(void) {\n${calls}\n    return 0;\n}\n`;
}

export const testWriter: Skill = {
  name: "test_writer",

  async execute(context: unknown): Promise<TestWriterOutput> {
    const input = context as TestWriterInput;
    const testFiles = input.changedFiles.map((file) => ({
      filePath: computeTestFilePath(file.filePath, file.language),
      targetFile: file.filePath,
      entryPoints: file.entryPoints,
      priority: computePriority(file.filePath, input.riskScores),
      template: generateTemplate(file.language, file.filePath, file.entryPoints),
    }));
    return { testFiles };
  },
};
