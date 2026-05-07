import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlanningWorkflow, type WorkflowConfig, type WorkflowResult as _WorkflowResult } from "../planning/workflow.js";
import type { Skill } from "@jurassic/skills";
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "fs";
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

describe("PlanningWorkflow", () => {
  let workflow: PlanningWorkflow;
  let tempDir: string;
  let repoDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "workflow-test-"));
    repoDir = mkdtempSync(join(tmpdir(), "workflow-repo-"));
    workflow = new PlanningWorkflow();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  function baseConfig(overrides?: Partial<WorkflowConfig>): WorkflowConfig {
    return {
      repoPath: repoDir,
      runId: "test-run-001",
      outputDir: tempDir,
      interactive: false,
      skills: new Map(),
      ...overrides,
    };
  }

  it("executes all phases in sequence", async () => {
    const executionOrder: string[] = [];
    const skills = new Map<string, Skill>();

    for (const name of ["repo_snapshot", "include_graph", "stack_fingerprint", "risk_scoring", "migration_evaluator"]) {
      skills.set(name, {
        name,
        execute: async () => {
          executionOrder.push(name);
          return { data: name };
        },
      });
    }

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    expect(result.status).toBe("completed");
    // All non-interactive phases should be present (user_dialog excluded)
    const phaseNames = result.phases.map((p) => p.name);
    expect(phaseNames).toContain("snapshot");
    expect(phaseNames).toContain("dependency_analysis");
    expect(phaseNames).toContain("stack_analysis");
    expect(phaseNames).toContain("risk_scoring");
    expect(phaseNames).toContain("migration_options");
    expect(phaseNames).toContain("plan_synthesis");
    expect(phaseNames).not.toContain("user_dialog");
    // Skills were called in order
    expect(executionOrder[0]).toBe("repo_snapshot");
    expect(executionOrder[1]).toBe("include_graph");
  });

  it("records phase timing", async () => {
    const skills = new Map<string, Skill>();
    skills.set("repo_snapshot", mockSkill("repo_snapshot", { files: [] }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    // The snapshot phase should have timing recorded
    const snapshot = result.phases.find((p) => p.name === "snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot!.startedAt).toBeDefined();
    expect(snapshot!.completedAt).toBeDefined();
    expect(new Date(snapshot!.startedAt!).getTime()).toBeLessThanOrEqual(
      new Date(snapshot!.completedAt!).getTime(),
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("skips phases without registered skills", async () => {
    // Register only repo_snapshot — others should be skipped
    const skills = new Map<string, Skill>();
    skills.set("repo_snapshot", mockSkill("repo_snapshot", { files: [] }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    // dependency_analysis needs include_graph which is not registered
    const depPhase = result.phases.find((p) => p.name === "dependency_analysis");
    expect(depPhase).toBeDefined();
    expect(depPhase!.status).toBe("skipped");

    // snapshot uses repo_snapshot which IS registered
    const snapPhase = result.phases.find((p) => p.name === "snapshot");
    expect(snapPhase!.status).toBe("completed");
  });

  it("handles phase failure gracefully and continues to next", async () => {
    const skills = new Map<string, Skill>();
    skills.set("repo_snapshot", failingSkill("repo_snapshot", "snapshot failed!"));
    skills.set("include_graph", mockSkill("include_graph", { nodes: [], edges: [] }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    // Overall status should be failed since a phase failed
    expect(result.status).toBe("failed");

    // Snapshot phase should be marked failed with error
    const snapPhase = result.phases.find((p) => p.name === "snapshot");
    expect(snapPhase!.status).toBe("failed");
    expect(snapPhase!.error).toBe("snapshot failed!");

    // dependency_analysis should still have run (completed)
    const depPhase = result.phases.find((p) => p.name === "dependency_analysis");
    expect(depPhase!.status).toBe("completed");
  });

  it("writes artifacts to output directory", async () => {
    const skills = new Map<string, Skill>();
    skills.set("repo_snapshot", mockSkill("repo_snapshot", { files: ["a.ts", "b.ts"] }));
    skills.set("include_graph", mockSkill("include_graph", { nodes: [], edges: [] }));

    const config = baseConfig({ skills });
    const result = await workflow.execute(config);

    expect(existsSync(result.artifactDir)).toBe(true);

    // Check that phase artifacts were written
    const snapPhase = result.phases.find((p) => p.name === "snapshot");
    expect(snapPhase!.artifacts.length).toBeGreaterThan(0);
    for (const artifactPath of snapPhase!.artifacts) {
      expect(existsSync(artifactPath)).toBe(true);
      const content = JSON.parse(readFileSync(artifactPath, "utf-8"));
      expect(content).toEqual({ files: ["a.ts", "b.ts"] });
    }

    // Check RunLogEvent files were written
    const files = readdirSync(result.artifactDir);
    const runLogFiles = files.filter((f) => f.startsWith("RunLogEvent_"));
    expect(runLogFiles.length).toBeGreaterThan(0);

    // Verify a RunLogEvent has correct structure
    const logContent = JSON.parse(readFileSync(join(result.artifactDir, runLogFiles[0]), "utf-8"));
    expect(logContent).toHaveProperty("timestamp");
    expect(logContent).toHaveProperty("runId", "test-run-001");
    expect(logContent).toHaveProperty("phase");
    expect(logContent).toHaveProperty("status");
  });

  it("interactive mode invokes user_dialog phase", async () => {
    let dialogCalled = false;
    const skills = new Map<string, Skill>();
    skills.set("user_dialog", {
      name: "user_dialog",
      execute: async (ctx: unknown) => {
        dialogCalled = true;
        const context = ctx as Record<string, unknown>;
        // Verify onQuestion callback was passed through
        expect(context.onQuestion).toBeDefined();
        return { decisions: [{ question: "framework?", answer: "React" }] };
      },
    });

    const config = baseConfig({
      skills,
      interactive: true,
      onQuestion: async (q: string) => `answer to: ${q}`,
    });

    const result = await workflow.execute(config);

    expect(dialogCalled).toBe(true);

    const dialogPhase = result.phases.find((p) => p.name === "user_dialog");
    expect(dialogPhase).toBeDefined();
    expect(dialogPhase!.status).toBe("completed");
    expect(dialogPhase!.artifacts.length).toBeGreaterThan(0);
  });

  it("returns correct WorkflowResult summary", async () => {
    const skills = new Map<string, Skill>();
    skills.set("repo_snapshot", mockSkill("repo_snapshot", { files: [] }));
    skills.set("include_graph", mockSkill("include_graph", { nodes: [] }));
    skills.set("stack_fingerprint", mockSkill("stack_fingerprint", { languages: [] }));
    skills.set("risk_scoring", mockSkill("risk_scoring", { items: [] }));
    skills.set("migration_evaluator", mockSkill("migration_evaluator", { options: [] }));

    const config = baseConfig({ skills, runId: "summary-run" });
    const result = await workflow.execute(config);

    expect(result.runId).toBe("summary-run");
    expect(result.status).toBe("completed");
    expect(result.artifactDir).toContain("summary-run");
    expect(result.artifactDir).toContain("planning");
    expect(result.totalArtifacts).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.phases)).toBe(true);
    // Without interactive mode, user_dialog should not appear
    expect(result.phases.find((p) => p.name === "user_dialog")).toBeUndefined();
    // All phases should have a terminal status
    for (const phase of result.phases) {
      expect(["completed", "skipped", "failed"]).toContain(phase.status);
    }
  });
});
