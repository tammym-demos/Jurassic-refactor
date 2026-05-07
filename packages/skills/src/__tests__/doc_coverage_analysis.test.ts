import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DocCoverageAnalysisSkill } from "../doc_coverage_analysis.js";

describe("DocCoverageAnalysisSkill", () => {
  let tmpDir: string;
  let skill: DocCoverageAnalysisSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "doc-coverage-test-"),
    );
    skill = new DocCoverageAnalysisSkill();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has name doc_coverage_analysis", () => {
    expect(skill.name).toBe("doc_coverage_analysis");
  });

  it("detects documented TypeScript export", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "lib.ts"),
      `/** Adds two numbers. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(1);
    expect(result.documentedAPIs).toBe(1);
    expect(result.overallPercentage).toBe(100);
    expect(result.gaps).toHaveLength(0);
  });

  it("detects undocumented TypeScript export", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "lib.ts"),
      `export function subtract(a: number, b: number): number {\n  return a - b;\n}\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(1);
    expect(result.documentedAPIs).toBe(0);
    expect(result.overallPercentage).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].symbol).toBe("subtract");
    expect(result.gaps[0].type).toBe("function");
  });

  it("detects missing README", async () => {
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;\n");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "foo.ts"), "export const y = 2;\n");

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.missingReadmes).toContain(".");
    expect(result.missingReadmes).toContain("sub");
  });

  it("generates doc stubs for undocumented symbols", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "api.ts"),
      `export function greet(name: string): string {\n  return "hi " + name;\n}\n\nexport class Greeter {}\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.stubs).toHaveLength(1);
    expect(result.stubs[0].filePath).toBe("api.ts");
    expect(result.stubs[0].content).toContain("greet");
    expect(result.stubs[0].content).toContain("Greeter");
  });

  it("returns 0% coverage for empty directory", async () => {
    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(0);
    expect(result.documentedAPIs).toBe(0);
    expect(result.overallPercentage).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  it("returns 100% coverage when all APIs are documented", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "full.ts"),
      `/** Alpha constant. */\nexport const ALPHA = 1;\n\n/** Beta function. */\nexport function beta() {}\n\n/** Gamma class. */\nexport class Gamma {}\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(3);
    expect(result.documentedAPIs).toBe(3);
    expect(result.overallPercentage).toBe(100);
    expect(result.gaps).toHaveLength(0);
    expect(result.stubs).toHaveLength(0);
  });

  it("handles Python files", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "module.py"),
      `"""Module doc."""\ndef helper():\n    pass\n\nclass MyClass:\n    pass\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(2);
    // helper has preceding docstring, MyClass does not
    const _helperAPI = result.gaps.find((g) => g.symbol === "helper");
    const classAPI = result.gaps.find((g) => g.symbol === "MyClass");
    // The module docstring precedes helper
    expect(result.documentedAPIs).toBeGreaterThanOrEqual(1);
    // MyClass has no preceding doc comment
    expect(classAPI).toBeDefined();
    expect(classAPI!.type).toBe("class");
  });

  it("handles C header files", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "api.h"),
      `#ifndef API_H\n#define API_H\n\n/* Initialize the system. */\nint init_system(void);\n\nvoid cleanup(void);\n\n#endif\n`,
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(2);
    const initGap = result.gaps.find((g) => g.symbol === "init_system");
    expect(initGap).toBeUndefined(); // it has a doc comment
    const cleanupGap = result.gaps.find((g) => g.symbol === "cleanup");
    expect(cleanupGap).toBeDefined();
  });

  it("skips node_modules and .git directories", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "dep.ts"),
      "export function secret() {}\n",
    );
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".git", "hook.ts"),
      "export function hook() {}\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "app.ts"),
      "export function main() {}\n",
    );

    const result = await skill.execute({ repoPath: tmpDir });
    expect(result.totalPublicAPIs).toBe(1);
    expect(result.gaps[0].symbol).toBe("main");
  });
});
