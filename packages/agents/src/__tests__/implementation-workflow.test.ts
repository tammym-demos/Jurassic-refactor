import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ImplementationWorkflow,
  type ImplWorkflowConfig,
  type ImplWorkflowResult as _ImplWorkflowResult,
} from "../implementation/workflow.js";
import { ApprovalGate } from "../implementation/approval-gate.js";
import type { Skill } from "@jurassic/skills";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** Create a mock skill that returns predictable data. */
function mockSkill(name: string, result: unknown = { mock: true }): Skill {
  return {
    name,
    execute: async (_ctx: unknown) => result,
  };
}

/** Create a mock skill that throws an error. */
function failingSkill(name: string, message: string): Skill {
  return {
    name,
    execute: async () => {
      throw new Error(message);
    },
  };
}

/** Write an APPROVED marker file in the given directory. */
function writeApprovalMarker(dir: string): void {
  writeFileSync(join(dir, "APPROVED"), "approved", "utf-8");
}

/** Write a minimal ModernizationPlan.json to the given directory. */
function writePlan(dir: string, plan?: Record<string, unknown>): void {
  const defaultPlan = {
    selectedOptionId: "opt-1",
    phases: [
      { name: "phase-1", tasks: [{ id: "t1", filePath: "src/a.ts", changeType: "modify", description: "update a" }] },
    ],
    tasks: [
      { id: "refactor-1", filePath: "src/b.ts", changeType: "refactor", description: "refactor b" },
    ],
  };
  writeFileSync(join(dir, "ModernizationPlan.json"), JSON.stringify(plan ?? defaultPlan, null, 2), "utf-8");
}

describe("ApprovalGate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "approval-gate-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns approved: true when APPROVED file exists", () => {
    writeApprovalMarker(tempDir);
    const result = ApprovalGate.check(tempDir);
    expect(result.approved).toBe(true);
    expect(result.markerPath).toContain("APPROVED");
    expect(result.error).toBeUndefined();
  });

  it("returns approved: false when APPROVED file is missing", () => {
    const result = ApprovalGate.check(tempDir);
    expect(result.approved).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("ImplementationWorkflow", () => {
  let workflow: ImplementationWorkflow;
  let outputDir: string;
  let planDir: string;
  let repoDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "impl-wf-output-"));
    planDir = mkdtempSync(join(tmpdir(), "impl-wf-plan-"));
    repoDir = mkdtempSync(join(tmpdir(), "impl-wf-repo-"));
    workflow = new ImplementationWorkflow();
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
    rmSync(planDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  function baseConfig(overrides?: Partial<ImplWorkflowConfig>): ImplWorkflowConfig {
    return {
      repoPath: repoDir,
      runId: "impl-run-001",
      planArtifactDir: planDir,
      outputDir,
      forkOwner: "test-owner",
      enableWrites: false,
      skills: new Map(),
      ...overrides,
    };
  }

  function allSkills(): Map<string, Skill> {
    const skills = new Map<string, Skill>();
    skills.set("test_writer", mockSkill("test_writer", { testFiles: ["test/a.test.ts"] }));
    skills.set("migration_executor", mockSkill("migration_executor", { migrated: true }));
    skills.set("dependency_upgrader", mockSkill("dependency_upgrader", { upgraded: true }));
    skills.set("code_refactor", mockSkill("code_refactor", { refactored: true }));
    skills.set("pr_writer", mockSkill("pr_writer", { prsCreated: 2 }));
    return skills;
  }

  // Test 1: Validates approval gate (rejects without APPROVED)
  it("rejects execution when APPROVED marker is missing", async () => {
    writePlan(planDir);
    const config = baseConfig({ skills: allSkills() });
    const result = await workflow.execute(config);

    expect(result.status).toBe("failed");
    const approvalPhase = result.phases.find((p) => p.name === "validate_approval");
    expect(approvalPhase).toBeDefined();
    expect(approvalPhase!.status).toBe("failed");
    expect(approvalPhase!.error).toContain("APPROVED");
  });

  // Test 2: Loads plan artifacts from directory
  it("loads plan artifacts from planArtifactDir", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    const config = baseConfig({ skills: allSkills() });
    const result = await workflow.execute(config);

    expect(result.status).toBe("completed");
    const loadPhase = result.phases.find((p) => p.name === "load_plan");
    expect(loadPhase).toBeDefined();
    expect(loadPhase!.status).toBe("completed");
    expect(loadPhase!.artifacts.length).toBeGreaterThan(0);
    expect(loadPhase!.artifacts[0]).toContain("ModernizationPlan.json");
  });

  // Test 3: Executes phases in sequence
  it("executes phases in sequence", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    const executionOrder: string[] = [];
    const skills = new Map<string, Skill>();

    for (const name of ["test_writer", "migration_executor", "dependency_upgrader", "code_refactor", "pr_writer"]) {
      skills.set(name, {
        name,
        execute: async () => {
          executionOrder.push(name);
          return { data: name, prsCreated: name === "pr_writer" ? 1 : undefined };
        },
      });
    }

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    expect(result.status).toBe("completed");
    expect(executionOrder[0]).toBe("test_writer");
    expect(executionOrder.indexOf("migration_executor")).toBeLessThan(executionOrder.indexOf("dependency_upgrader"));
    expect(executionOrder.indexOf("dependency_upgrader")).toBeLessThan(executionOrder.indexOf("code_refactor"));
    expect(executionOrder.indexOf("code_refactor")).toBeLessThan(executionOrder.indexOf("pr_writer"));
  });

  // Test 4: Skips phases without registered skills
  it("skips phases without registered skills", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    // Only register test_writer — other skill phases should be skipped
    const skills = new Map<string, Skill>();
    skills.set("test_writer", mockSkill("test_writer", { testFiles: [] }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    expect(result.status).toBe("completed");

    const testPhase = result.phases.find((p) => p.name === "generate_test_scaffold");
    expect(testPhase!.status).toBe("completed");

    const migrationPhase = result.phases.find((p) => p.name === "execute_migrations");
    expect(migrationPhase!.status).toBe("skipped");

    const depPhase = result.phases.find((p) => p.name === "upgrade_dependencies");
    expect(depPhase!.status).toBe("skipped");

    const refactorPhase = result.phases.find((p) => p.name === "apply_refactors");
    expect(refactorPhase!.status).toBe("skipped");

    const prPhase = result.phases.find((p) => p.name === "create_prs");
    expect(prPhase!.status).toBe("skipped");
  });

  // Test 5: Handles phase failure gracefully
  it("handles phase failure gracefully", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    const skills = new Map<string, Skill>();
    skills.set("test_writer", failingSkill("test_writer", "test generation exploded"));
    skills.set("migration_executor", mockSkill("migration_executor", { ok: true }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    expect(result.status).toBe("failed");

    const testPhase = result.phases.find((p) => p.name === "generate_test_scaffold");
    expect(testPhase!.status).toBe("failed");
    expect(testPhase!.error).toBe("test generation exploded");

    // Subsequent phases are skipped after failure (except write_manifest)
    const migrationPhase = result.phases.find((p) => p.name === "execute_migrations");
    expect(migrationPhase!.status).toBe("skipped");

    // write_manifest still runs even after failure
    const manifestPhase = result.phases.find((p) => p.name === "write_manifest");
    expect(manifestPhase!.status).toBe("completed");
  });

  // Test 6: Writes artifacts to output directory
  it("writes artifacts to output directory", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    const config = baseConfig({ skills: allSkills() });
    const result = await workflow.execute(config);

    expect(existsSync(result.artifactDir)).toBe(true);

    // TestScaffold artifact
    const scaffoldPath = join(result.artifactDir, "TestScaffold.json");
    expect(existsSync(scaffoldPath)).toBe(true);
    const scaffold = JSON.parse(readFileSync(scaffoldPath, "utf-8"));
    expect(scaffold).toEqual({ testFiles: ["test/a.test.ts"] });

    // ImplementationLog artifact
    const logPath = join(result.artifactDir, "ImplementationLog.json");
    expect(existsSync(logPath)).toBe(true);

    // Manifest artifact
    const manifestPath = join(result.artifactDir, "Manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest).toHaveProperty("artifactDir");
    expect(manifest).toHaveProperty("prsCreated");
  });

  // Test 7: Returns correct ImplWorkflowResult
  it("returns correct ImplWorkflowResult", async () => {
    writeApprovalMarker(planDir);
    writePlan(planDir);
    const config = baseConfig({ skills: allSkills(), runId: "result-run" });
    const result = await workflow.execute(config);

    expect(result.runId).toBe("result-run");
    expect(result.status).toBe("completed");
    expect(result.artifactDir).toContain("result-run");
    expect(result.artifactDir).toContain("implementation");
    expect(result.totalArtifacts).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.prsCreated).toBe(2);
    expect(Array.isArray(result.phases)).toBe(true);

    // All phases should have a terminal status
    for (const phase of result.phases) {
      expect(["completed", "skipped", "failed"]).toContain(phase.status);
    }
  });
});
