import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PolicyEnforcer, globMatch, type PolicyInput } from "../policy.js";
import { ApprovalGate } from "../../../agents/src/implementation/approval-gate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    agentType: "implementation",
    operation: "write",
    targetPath: "src/foo.ts",
    enableWrites: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Gate enforcement tests
// ---------------------------------------------------------------------------

describe("Gate enforcement", () => {
  let tmpDir: string;
  let gateFile: string;
  let enforcer: PolicyEnforcer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-test-"));
    gateFile = path.join(tmpDir, "APPROVED");
    enforcer = new PolicyEnforcer();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. Write without gate file → denied
  it("denies write when gate file is absent", () => {
    const result = enforcer.checkAccess(
      makeInput({ gateFilePath: path.join(tmpDir, "APPROVED") }),
    );
    expect(result.overallAllowed).toBe(false);
    const gateDenied = result.decisions.find((d) => d.rule === "gate-file-required");
    expect(gateDenied).toBeDefined();
    expect(gateDenied!.allowed).toBe(false);
  });

  // 2. Write with gate file present → allowed
  it("allows write when gate file exists and enableWrites is true", () => {
    fs.writeFileSync(gateFile, "approved");
    const result = enforcer.checkAccess(
      makeInput({ gateFilePath: gateFile }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  // 3. Write with gate but enableWrites=false → denied
  it("denies write when gate file exists but enableWrites is false", () => {
    fs.writeFileSync(gateFile, "approved");
    const result = enforcer.checkAccess(
      makeInput({ gateFilePath: gateFile, enableWrites: false }),
    );
    expect(result.overallAllowed).toBe(false);
    const flagDenied = result.decisions.find((d) => d.rule === "enable-writes-flag");
    expect(flagDenied).toBeDefined();
    expect(flagDenied!.allowed).toBe(false);
  });

  // 4. Read operations always pass regardless of gate
  it("allows read operations regardless of gate file", () => {
    const result = enforcer.checkAccess(
      makeInput({ operation: "read", enableWrites: false }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  it("allows read even for planning agent without gate", () => {
    const result = enforcer.checkAccess(
      makeInput({ agentType: "planning", operation: "read", enableWrites: false }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  // 5. Planning agent write → always denied (even with gate)
  it("denies planning agent write even when gate file exists", () => {
    fs.writeFileSync(gateFile, "approved");
    const result = enforcer.checkAccess(
      makeInput({ agentType: "planning", gateFilePath: gateFile }),
    );
    expect(result.overallAllowed).toBe(false);
    const planDenied = result.decisions.find((d) => d.rule === "planning-agent-read-only");
    expect(planDenied).toBeDefined();
    expect(planDenied!.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Path allowlist tests
// ---------------------------------------------------------------------------

describe("Path allowlist", () => {
  let tmpDir: string;
  let gateFile: string;
  let enforcer: PolicyEnforcer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-allowlist-"));
    gateFile = path.join(tmpDir, "APPROVED");
    fs.writeFileSync(gateFile, "approved");
    enforcer = new PolicyEnforcer();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. Write to allowed path → allowed
  it("allows write to a path matching the allowlist", () => {
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "src/components/button.ts",
        allowedPaths: ["src/**"],
      }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  // 7. Write to disallowed path → denied
  it("denies write to a path not in the allowlist", () => {
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "secrets/env.prod",
        allowedPaths: ["src/**"],
      }),
    );
    expect(result.overallAllowed).toBe(false);
    const denied = result.decisions.find((d) => d.rule === "path-allowlist");
    expect(denied).toBeDefined();
    expect(denied!.allowed).toBe(false);
  });

  // 8. Multiple allowedPaths checked correctly
  it("allows write when path matches any of multiple allowed patterns", () => {
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "tests/unit/gate.test.ts",
        allowedPaths: ["src/**", "tests/**"],
      }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  it("denies write when path matches none of multiple allowed patterns", () => {
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "config/prod.yaml",
        allowedPaths: ["src/**", "tests/**"],
      }),
    );
    expect(result.overallAllowed).toBe(false);
  });

  // 9. Glob patterns work (e.g. "packages/**/*.ts")
  it("supports deep glob patterns like packages/**/*.ts", () => {
    expect(globMatch("packages/**/*.ts", "packages/skills/src/policy.ts")).toBe(true);
    expect(globMatch("packages/**/*.ts", "packages/skills/src/index.js")).toBe(false);

    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "packages/skills/src/policy.ts",
        allowedPaths: ["packages/**/*.ts"],
      }),
    );
    expect(result.overallAllowed).toBe(true);
  });

  it("allows all paths when allowedPaths is empty", () => {
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gateFile,
        targetPath: "anywhere/file.ts",
        allowedPaths: [],
      }),
    );
    expect(result.overallAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ApprovalGate integration tests
// ---------------------------------------------------------------------------

describe("ApprovalGate integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-gate-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 10. ApprovalGate.check returns approved when APPROVED file exists
  it("returns approved when APPROVED marker exists", () => {
    fs.writeFileSync(path.join(tmpDir, "APPROVED"), "yes");
    const result = ApprovalGate.check(tmpDir);
    expect(result.approved).toBe(true);
    expect(result.markerPath).toBe(path.join(tmpDir, "APPROVED"));
    expect(result.error).toBeUndefined();
  });

  // 11. ApprovalGate.check returns not approved when APPROVED file missing
  it("returns not approved when APPROVED marker is missing", () => {
    const result = ApprovalGate.check(tmpDir);
    expect(result.approved).toBe(false);
    expect(result.markerPath).toBe(path.join(tmpDir, "APPROVED"));
    expect(result.error).toBeDefined();
    expect(result.error).toContain("APPROVED marker not found");
  });

  // 12. Implementation Agent workflow rejects without gate
  it("blocks implementation write workflow when ApprovalGate is not approved", () => {
    const gate = ApprovalGate.check(tmpDir);
    expect(gate.approved).toBe(false);

    // Without gate approval, PolicyEnforcer should also deny the write
    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gate.markerPath,
        enableWrites: true,
      }),
    );
    expect(result.overallAllowed).toBe(false);
  });

  it("allows implementation write workflow when ApprovalGate is approved", () => {
    fs.writeFileSync(path.join(tmpDir, "APPROVED"), "approved");
    const gate = ApprovalGate.check(tmpDir);
    expect(gate.approved).toBe(true);

    const enforcer = new PolicyEnforcer();
    const result = enforcer.checkAccess(
      makeInput({
        gateFilePath: gate.markerPath,
        enableWrites: true,
      }),
    );
    expect(result.overallAllowed).toBe(true);
  });
});
