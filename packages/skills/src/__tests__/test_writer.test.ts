import { describe, it, expect } from "vitest";
import { testWriter, type TestWriterInput, type TestWriterOutput } from "../test_writer.js";

describe("test_writer skill", () => {
  it("has the correct name", () => {
    expect(testWriter.name).toBe("test_writer");
  });

  it("generates test file path correctly for TypeScript files", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/utils/helpers.ts",
          language: "typescript",
          entryPoints: [{ name: "add", type: "function" }],
        },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    expect(result.testFiles[0].filePath).toContain("__tests__");
    expect(result.testFiles[0].filePath).toContain("helpers.test.ts");
  });

  it("generates test file path correctly for Python files", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/utils/helpers.py",
          language: "python",
          entryPoints: [{ name: "add", type: "function" }],
        },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    expect(result.testFiles[0].filePath).toContain("__tests__");
    expect(result.testFiles[0].filePath).toContain("helpers.test.py");
  });

  it("assigns priority based on risk scores", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        { filePath: "high.ts", language: "typescript", entryPoints: [{ name: "a", type: "function" }] },
        { filePath: "med.ts", language: "typescript", entryPoints: [{ name: "b", type: "function" }] },
        { filePath: "low.ts", language: "typescript", entryPoints: [{ name: "c", type: "function" }] },
      ],
      riskScores: { "high.ts": 0.9, "med.ts": 0.5, "low.ts": 0.1 },
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    expect(result.testFiles[0].priority).toBe("high");
    expect(result.testFiles[1].priority).toBe("medium");
    expect(result.testFiles[2].priority).toBe("low");
  });

  it("defaults priority to medium when no risk scores provided", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        { filePath: "src/foo.ts", language: "typescript", entryPoints: [{ name: "foo", type: "function" }] },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    expect(result.testFiles[0].priority).toBe("medium");
  });

  it("template contains entry point names", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/math.ts",
          language: "typescript",
          entryPoints: [
            { name: "add", type: "function" },
            { name: "Calculator", type: "class" },
          ],
        },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    const template = result.testFiles[0].template;
    expect(template).toContain("add");
    expect(template).toContain("Calculator");
  });

  it("output is TestScaffold-compatible structure", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/api.ts",
          language: "typescript",
          entryPoints: [{ name: "getUser", type: "endpoint" }],
        },
      ],
      riskScores: { "src/api.ts": 0.8 },
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    expect(result).toHaveProperty("testFiles");
    expect(Array.isArray(result.testFiles)).toBe(true);
    const tf = result.testFiles[0];
    expect(tf).toHaveProperty("filePath");
    expect(tf).toHaveProperty("targetFile");
    expect(tf).toHaveProperty("entryPoints");
    expect(tf).toHaveProperty("priority");
    expect(tf).toHaveProperty("template");
    expect(tf.entryPoints[0]).toHaveProperty("name");
    expect(tf.entryPoints[0]).toHaveProperty("type");
  });

  it("generates correct template for Python files", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/calc.py",
          language: "python",
          entryPoints: [{ name: "multiply", type: "function" }],
        },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    const template = result.testFiles[0].template;
    expect(template).toContain("def test_multiply");
    expect(template).toContain("import multiply");
  });

  it("generates correct template for C files", async () => {
    const input: TestWriterInput = {
      repoPath: "/repo",
      changedFiles: [
        {
          filePath: "src/utils.c",
          language: "c",
          entryPoints: [{ name: "init", type: "function" }],
        },
      ],
    };
    const result = (await testWriter.execute(input)) as TestWriterOutput;
    const template = result.testFiles[0].template;
    expect(template).toContain("assert.h");
    expect(template).toContain("test_init");
  });
});
