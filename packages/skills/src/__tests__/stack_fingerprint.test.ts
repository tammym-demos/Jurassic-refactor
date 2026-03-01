import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StackFingerprintSkill } from "../stack_fingerprint.js";

describe("StackFingerprintSkill", () => {
  let tmpDir: string;
  let skill: StackFingerprintSkill;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "stack-fingerprint-test-"),
    );
    skill = new StackFingerprintSkill();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has name stack_fingerprint", () => {
    expect(skill.name).toBe("stack_fingerprint");
  });

  it("detects TypeScript from tsconfig.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      '{"compilerOptions":{}}',
    );
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");

    const result = await skill.execute({ repoPath: tmpDir });

    const ts = result.languages.find((l) => l.name === "TypeScript");
    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);
    expect(ts!.evidence).toBe("tsconfig.json");
  });

  it("detects Python from requirements.txt", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "requirements.txt"),
      "flask==2.3.0\nrequests==2.31.0\n",
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const py = result.languages.find((l) => l.name === "Python");
    expect(py).toBeDefined();
    expect(py!.confidence).toBe(1.0);
    expect(py!.evidence).toBe("requirements.txt");

    const flask = result.frameworks.find((f) => f.name === "Flask");
    expect(flask).toBeDefined();
    expect(flask!.version).toBe("2.3.0");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "lockfileVersion: 5\n");

    const result = await skill.execute({ repoPath: tmpDir });

    const pnpm = result.packageManagers.find((p) => p.name === "pnpm");
    expect(pnpm).toBeDefined();
    expect(pnpm!.confidence).toBe(1.0);
    expect(pnpm!.evidence).toBe("pnpm-lock.yaml");
  });

  it("extracts dependency versions from package.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          react: "^18.2.0",
          express: "~4.18.0",
        },
      }),
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const react = result.runtimeDependencies.find((d) => d.name === "react");
    expect(react).toBeDefined();
    expect(react!.version).toBe("^18.2.0");
    expect(react!.category).toBe("runtime");

    const express = result.runtimeDependencies.find(
      (d) => d.name === "express",
    );
    expect(express).toBeDefined();
    expect(express!.version).toBe("~4.18.0");

    // Frameworks should also be detected
    const reactFw = result.frameworks.find((f) => f.name === "React");
    expect(reactFw).toBeDefined();
    expect(reactFw!.version).toBe("^18.2.0");
  });

  it("returns empty results for empty directory", async () => {
    const result = await skill.execute({ repoPath: tmpDir });

    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual([]);
    expect(result.buildTools).toEqual([]);
    expect(result.packageManagers).toEqual([]);
    expect(result.runtimeDependencies).toEqual([]);
  });

  it("detects multiple languages in mixed repo", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      '{"compilerOptions":{}}',
    );
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmpDir, "main.py"), 'print("hello")');
    fs.writeFileSync(path.join(tmpDir, "lib.go"), "package main");
    fs.writeFileSync(
      path.join(tmpDir, "requirements.txt"),
      "requests==2.31.0\n",
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const langNames = result.languages.map((l) => l.name);
    expect(langNames).toContain("TypeScript");
    expect(langNames).toContain("Python");
    expect(langNames).toContain("Go");
    expect(result.languages.length).toBeGreaterThanOrEqual(3);
  });

  it("confidence scoring works correctly", async () => {
    // Config file → 1.0 confidence
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      '{"compilerOptions":{}}',
    );
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");

    // Only file extension, no config → 0.5 or 0.8
    fs.writeFileSync(path.join(tmpDir, "main.rs"), "fn main() {}");

    const result = await skill.execute({ repoPath: tmpDir });

    const ts = result.languages.find((l) => l.name === "TypeScript");
    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe(1.0);

    const rust = result.languages.find((l) => l.name === "Rust");
    expect(rust).toBeDefined();
    expect(rust!.confidence).toBeLessThan(1.0);
    expect(rust!.confidence).toBeGreaterThan(0);
  });

  it("detects build tools", async () => {
    fs.writeFileSync(path.join(tmpDir, "Makefile"), "all:\n\techo hello\n");
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      '{"compilerOptions":{}}',
    );

    const result = await skill.execute({ repoPath: tmpDir });

    const toolNames = result.buildTools.map((t) => t.name);
    expect(toolNames).toContain("Make");
    expect(toolNames).toContain("TypeScript Compiler");
  });
});
