import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TestScaffoldSkill,
  type TestScaffoldInput,
  type TestScaffoldOutput,
} from "../test_scaffold.js";

describe("TestScaffoldSkill", () => {
  let skill: TestScaffoldSkill;
  let tempDir: string;

  beforeEach(async () => {
    skill = new TestScaffoldSkill();
    tempDir = await mkdtemp(join(tmpdir(), "test-scaffold-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has name 'test_scaffold'", () => {
    expect(skill.name).toBe("test_scaffold");
  });

  it("detects exported TypeScript function", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(
      join(tempDir, "src", "utils.ts"),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.totalEntries).toBe(1);
    expect(result.entries[0].name).toBe("add");
    expect(result.entries[0].type).toBe("function");
    expect(result.entries[0].signature).toContain("add");
  });

  it("detects existing test coverage", async () => {
    await mkdir(join(tempDir, "src", "__tests__"), { recursive: true });
    await writeFile(
      join(tempDir, "src", "math.ts"),
      'export function multiply(a: number, b: number) {\n  return a * b;\n}\n',
      "utf-8",
    );
    await writeFile(
      join(tempDir, "src", "__tests__", "math.test.ts"),
      'import { multiply } from "../math.js";\nit("works", () => { multiply(2,3); });\n',
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    const entry = result.entries.find((e) => e.name === "multiply");
    expect(entry).toBeDefined();
    expect(entry!.hasExistingTests).toBe(true);
    expect(entry!.existingTestFile).toContain("math.test.ts");
  });

  it("marks uncovered exported function as high priority", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(
      join(tempDir, "src", "api.ts"),
      'export function fetchData(url: string) {\n  return fetch(url);\n}\n',
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.entries[0].priority).toBe("high");
    expect(result.entries[0].hasExistingTests).toBe(false);
  });

  it("generates vitest template for TypeScript", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(
      join(tempDir, "src", "helpers.ts"),
      'export function greet(name: string) {\n  return `Hello ${name}`;\n}\n',
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].framework).toBe("vitest");
    expect(result.templates[0].content).toContain('import { describe, it, expect } from "vitest"');
    expect(result.templates[0].content).toContain("greet");
    expect(result.templates[0].entries).toContain("greet");
  });

  it("generates pytest template for Python", async () => {
    await mkdir(join(tempDir, "lib"), { recursive: true });
    await writeFile(
      join(tempDir, "lib", "calc.py"),
      "def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b\n",
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    const pyTemplate = result.templates.find((t) => t.framework === "pytest");
    expect(pyTemplate).toBeDefined();
    expect(pyTemplate!.content).toContain("import pytest");
    expect(pyTemplate!.content).toContain("def test_add():");
    expect(pyTemplate!.content).toContain("def test_subtract():");
    expect(pyTemplate!.entries).toContain("add");
    expect(pyTemplate!.entries).toContain("subtract");
  });

  it("returns zero entries for empty directory", async () => {
    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.totalEntries).toBe(0);
    expect(result.coveredEntries).toBe(0);
    expect(result.uncoveredEntries).toBe(0);
    expect(result.entries).toHaveLength(0);
    expect(result.templates).toHaveLength(0);
  });

  it("correctly calculates coverage percentage", async () => {
    await mkdir(join(tempDir, "src", "__tests__"), { recursive: true });
    await writeFile(
      join(tempDir, "src", "mod.ts"),
      [
        "export function covered() { return 1; }",
        "export function uncoveredA() { return 2; }",
        "export function uncoveredB() { return 3; }",
      ].join("\n") + "\n",
      "utf-8",
    );
    // Test file that only mentions "covered"
    await writeFile(
      join(tempDir, "src", "__tests__", "mod.test.ts"),
      'import { covered } from "../mod.js";\nit("works", () => { covered(); });\n',
      "utf-8",
    );

    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.totalEntries).toBe(3);
    expect(result.coveredEntries).toBe(1);
    expect(result.uncoveredEntries).toBe(2);
    expect(result.coveragePercentage).toBe(33);
  });

  it("returns 100% coverage for empty directory", async () => {
    const input: TestScaffoldInput = { repoPath: tempDir };
    const result = (await skill.execute(input)) as TestScaffoldOutput;

    expect(result.coveragePercentage).toBe(100);
  });
});
