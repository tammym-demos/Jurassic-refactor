import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PolicySkill,
  PolicyEnforcer,
  globMatch,
  type PolicyInput,
  type PolicyResult as _PolicyResult,
} from "../policy.js";

describe("PolicySkill", () => {
  it("has name policy", () => {
    const skill = new PolicySkill();
    expect(skill.name).toBe("policy");
  });

  // Test 1: Read operations always allowed
  it("allows read operations for any agent type", async () => {
    const skill = new PolicySkill();
    const result = await skill.execute({
      agentType: "planning",
      operation: "read",
      targetPath: "/src/foo.ts",
      enableWrites: false,
    } satisfies PolicyInput);
    expect(result.overallAllowed).toBe(true);
    expect(result.decisions.every((d) => d.allowed)).toBe(true);
  });

  // Test 2: Planning Agent cannot write
  it("denies write operations for Planning Agent", async () => {
    const skill = new PolicySkill();
    const result = await skill.execute({
      agentType: "planning",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: true,
    } satisfies PolicyInput);
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "planning-agent-read-only");
    expect(denied).toBeDefined();
    expect(denied!.allowed).toBe(false);
  });

  // Test 3: Implementation Agent write requires enableWrites
  it("denies Implementation Agent write without enableWrites", async () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: false,
      gateFilePath: "/nonexistent/APPROVED",
    });
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "enable-writes-flag");
    expect(denied).toBeDefined();
    expect(denied!.allowed).toBe(false);
  });

  // Test 4: Implementation Agent write requires gate file
  it("denies Implementation Agent write without gate file path", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "create",
      targetPath: "/src/foo.ts",
      enableWrites: true,
    });
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "gate-file-required");
    expect(denied).toBeDefined();
    expect(denied!.allowed).toBe(false);
  });
});

describe("PolicyEnforcer — gate file on disk", () => {
  let tmpDir: string;
  let gateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-test-"));
    gateFile = path.join(tmpDir, "APPROVED");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 5: Gate file check verifies file exists on disk
  it("allows write when gate file exists on disk", () => {
    fs.writeFileSync(gateFile, "approved");
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: true,
      gateFilePath: gateFile,
    });
    expect(result.overallAllowed).toBe(true);
  });

  it("denies write when gate file does not exist on disk", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: true,
      gateFilePath: path.join(tmpDir, "MISSING"),
    });
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "gate-file-required");
    expect(denied!.allowed).toBe(false);
  });

  // Test 7: CI environment requires gate file
  it("denies write in CI when gate file is missing", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: true,
      ciEnvironment: true,
      gateFilePath: path.join(tmpDir, "MISSING"),
    });
    expect(result.overallAllowed).toBe(false);
    const ciDenied = result.decisions.find((d) => d.rule === "ci-environment");
    expect(ciDenied).toBeDefined();
    expect(ciDenied!.allowed).toBe(false);
  });

  it("allows write in CI when gate file exists", () => {
    fs.writeFileSync(gateFile, "approved");
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "/src/foo.ts",
      enableWrites: true,
      ciEnvironment: true,
      gateFilePath: gateFile,
    });
    expect(result.overallAllowed).toBe(true);
  });
});

describe("PolicyEnforcer — path allowlist", () => {
  let tmpDir: string;
  let gateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-test-"));
    gateFile = path.join(tmpDir, "APPROVED");
    fs.writeFileSync(gateFile, "approved");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 6: Path allowlist enforcement
  it("denies write when path does not match allowlist", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "packages/core/secret.ts",
      enableWrites: true,
      gateFilePath: gateFile,
      allowedPaths: ["src/**"],
    });
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "path-allowlist");
    expect(denied!.allowed).toBe(false);
  });

  it("allows write when path matches allowlist", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "write",
      targetPath: "src/components/button.ts",
      enableWrites: true,
      gateFilePath: gateFile,
      allowedPaths: ["src/**"],
    });
    expect(result.overallAllowed).toBe(true);
  });
});

describe("PolicyEnforcer — multiple rules and auditability", () => {
  // Test 8: Multiple rules evaluated
  it("evaluates all rules even when first rule denies", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "planning",
      operation: "delete",
      targetPath: "/src/foo.ts",
      enableWrites: false,
    });
    expect(result.overallAllowed).toBe(false);
    // All 6 default rules should produce decisions
    expect(result.decisions.length).toBeGreaterThanOrEqual(6);
  });

  // Test 9: PolicyEnforcer returns all decisions
  it("returns all decisions for auditability", () => {
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "read",
      targetPath: "/src/foo.ts",
      enableWrites: false,
    });
    expect(result.decisions.length).toBeGreaterThanOrEqual(6);
    expect(result.agentType).toBe("implementation");
    expect(result.summary).toContain("allowed");
    for (const d of result.decisions) {
      expect(d).toHaveProperty("allowed");
      expect(d).toHaveProperty("reason");
      expect(d).toHaveProperty("rule");
    }
  });

  it("supports adding custom rules", () => {
    const enforcer = new PolicyEnforcer();
    enforcer.addRule({
      name: "custom-deny-all",
      evaluate: () => ({ allowed: false, reason: "Custom deny", rule: "custom-deny-all" }),
    });
    const result = enforcer.checkAccess({
      agentType: "implementation",
      operation: "read",
      targetPath: "/src/foo.ts",
      enableWrites: false,
    });
    expect(result.overallAllowed).toBe(false);
    const custom = result.decisions.find((d) => d.rule === "custom-deny-all");
    expect(custom).toBeDefined();
    expect(custom!.allowed).toBe(false);
  });
});

describe("globMatch", () => {
  it("matches simple wildcards", () => {
    expect(globMatch("src/*.ts", "src/foo.ts")).toBe(true);
    expect(globMatch("src/*.ts", "src/deep/foo.ts")).toBe(false);
  });

  it("matches double-star globs", () => {
    expect(globMatch("src/**", "src/deep/nested/foo.ts")).toBe(true);
    expect(globMatch("**/*.ts", "src/foo.ts")).toBe(true);
  });
});
