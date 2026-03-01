import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { PlanningAgent } from "../planning/index.js";
import { ImplementationAgent } from "../implementation/index.js";
import type { AgentContext } from "../base.js";

/**
 * End-to-end tests for the agent pipeline.
 *
 * These are integration-level tests that exercise the full agent flow
 * using temp directories for isolation.
 */
describe("E2E Agent Tests", () => {
  let tempDir: string;
  let fixturePath: string;
  let profilePath: string;
  let artifactsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-agent-test-"));
    fixturePath = path.join(tempDir, "fixture.json");
    profilePath = path.join(tempDir, "profile.json");
    artifactsDir = path.join(tempDir, "artifacts");
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({ repoUrl: "https://github.com/test/repo", files: [] }),
    );
    fs.writeFileSync(profilePath, JSON.stringify({ name: "test-profile" }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeContext(runId: string): AgentContext {
    return { runId, repoPath: tempDir, fixturePath, profilePath, artifactsDir };
  }

  // ─── Planning Agent ───

  describe("Planning Agent produces all expected artifacts", () => {
    it("writes all expected artifact files to the output directory", async () => {
      const agent = new PlanningAgent();
      await agent.initialize(makeContext("plan-run-1"));
      await agent.run();

      const planDir = path.join(artifactsDir, "plan-run-1", "planning");
      const files = fs.readdirSync(planDir);

      const expectedFiles = [
        "DependencyGraph.json",
        "StackAnalysis.json",
        "RiskAssessment.json",
        "DocCoverage.json",
        "MigrationOptions.json",
        "ModernizationPlan.json",
        "Manifest.json",
        "RunLogEvent.json",
      ];

      for (const file of expectedFiles) {
        expect(files, `missing artifact: ${file}`).toContain(file);
      }
    });
  });

  describe("Planning Agent determinism", () => {
    it("produces identical artifact structures across two runs with same inputs", async () => {
      const agent1 = new PlanningAgent();
      await agent1.initialize(makeContext("det-run-1"));
      await agent1.run();

      const agent2 = new PlanningAgent();
      await agent2.initialize(makeContext("det-run-2"));
      await agent2.run();

      const dir1 = path.join(artifactsDir, "det-run-1", "planning");
      const dir2 = path.join(artifactsDir, "det-run-2", "planning");

      // Compare artifacts that should be structurally identical
      const stableArtifacts = [
        "DependencyGraph.json",
        "StackAnalysis.json",
        "RiskAssessment.json",
        "DocCoverage.json",
        "MigrationOptions.json",
        "ModernizationPlan.json",
      ];

      for (const file of stableArtifacts) {
        const data1 = JSON.parse(fs.readFileSync(path.join(dir1, file), "utf-8"));
        const data2 = JSON.parse(fs.readFileSync(path.join(dir2, file), "utf-8"));
        expect(Object.keys(data1).sort()).toEqual(Object.keys(data2).sort());
        expect(data1).toEqual(data2);
      }

      // Manifest has timestamps and runId that differ — verify same keys
      const manifest1 = JSON.parse(
        fs.readFileSync(path.join(dir1, "Manifest.json"), "utf-8"),
      );
      const manifest2 = JSON.parse(
        fs.readFileSync(path.join(dir2, "Manifest.json"), "utf-8"),
      );
      expect(Object.keys(manifest1).sort()).toEqual(
        Object.keys(manifest2).sort(),
      );
      expect(manifest1.agent).toBe(manifest2.agent);
      expect(manifest1.status).toBe(manifest2.status);
    });
  });

  describe("Planning Agent interactive mode captures user decisions", () => {
    it("writes UserDecisions artifact when interactive mode is enabled", async () => {
      const onQuestion = async (_question: string, _choices?: string[]) =>
        "user-answer";
      const agent = new PlanningAgent({ interactive: true, onQuestion });
      await agent.initialize(makeContext("interactive-run"));
      await agent.run();

      const planDir = path.join(artifactsDir, "interactive-run", "planning");
      const decisionsPath = path.join(planDir, "UserDecisions.json");
      expect(fs.existsSync(decisionsPath)).toBe(true);

      const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf-8"));
      expect(decisions).toHaveProperty("decisions");
      expect(Array.isArray(decisions.decisions)).toBe(true);
    });
  });

  // ─── Implementation Agent ───

  describe("Implementation Agent rejects without planning artifacts", () => {
    it("throws when required planning artifacts are missing", async () => {
      const agent = new ImplementationAgent();
      await agent.initialize(makeContext("no-plan-run"));
      await expect(agent.run()).rejects.toThrow(
        "Missing required planning artifact",
      );
    });
  });

  describe("Implementation Agent runs with approved plan", () => {
    it("produces ImplementationLog and Manifest when planning artifacts exist", async () => {
      const runId = "impl-run-1";
      writeMockPlanningArtifacts(runId);

      const agent = new ImplementationAgent();
      await agent.initialize(makeContext(runId));
      await agent.run();

      const implDir = path.join(artifactsDir, runId, "implementation");
      expect(fs.existsSync(path.join(implDir, "ImplementationLog.json"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(implDir, "TestScaffold.json"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(implDir, "Manifest.json"))).toBe(true);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(implDir, "Manifest.json"), "utf-8"),
      );
      expect(manifest.agent).toBe("implementation");
      expect(manifest.status).toBe("completed");
    });
  });

  // ─── Full pipeline ───

  describe("Full pipeline: plan → implement", () => {
    it("runs PlanningAgent then ImplementationAgent using planning output", async () => {
      const runId = "pipeline-run";

      // Phase 1: Planning
      const planner = new PlanningAgent();
      await planner.initialize(makeContext(runId));
      await planner.run();

      const planDir = path.join(artifactsDir, runId, "planning");
      expect(fs.existsSync(path.join(planDir, "Manifest.json"))).toBe(true);

      // Phase 2: Implementation (uses same runId to find planning artifacts)
      const implementer = new ImplementationAgent();
      await implementer.initialize(makeContext(runId));
      await implementer.run();

      const implDir = path.join(artifactsDir, runId, "implementation");
      expect(fs.existsSync(path.join(implDir, "Manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(implDir, "ImplementationLog.json"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(implDir, "TestScaffold.json"))).toBe(
        true,
      );

      // Verify both agent outputs coexist
      const planManifest = JSON.parse(
        fs.readFileSync(path.join(planDir, "Manifest.json"), "utf-8"),
      );
      const implManifest = JSON.parse(
        fs.readFileSync(path.join(implDir, "Manifest.json"), "utf-8"),
      );
      expect(planManifest.agent).toBe("planning");
      expect(implManifest.agent).toBe("implementation");
      expect(planManifest.status).toBe("completed");
      expect(implManifest.status).toBe("completed");
      expect(planManifest.runId).toBe(implManifest.runId);
    });
  });

  // ─── Artifact schema validity ───

  describe("Artifact schema validity", () => {
    it("all produced artifacts are valid JSON with required top-level fields", async () => {
      const runId = "schema-run";

      // Run planning to generate artifacts
      const planner = new PlanningAgent();
      await planner.initialize(makeContext(runId));
      await planner.run();

      const planDir = path.join(artifactsDir, runId, "planning");
      const files = fs.readdirSync(planDir).filter((f) => f.endsWith(".json"));

      // Each file must be parseable JSON
      for (const file of files) {
        const raw = fs.readFileSync(path.join(planDir, file), "utf-8");
        expect(() => JSON.parse(raw), `${file} is not valid JSON`).not.toThrow();
      }

      // Verify required top-level fields per artifact type
      const requiredFields: Record<string, string[]> = {
        "Manifest.json": ["runId", "repoUrl", "agent", "status", "artifactPaths"],
        "DependencyGraph.json": ["nodes", "edges"],
        "StackAnalysis.json": [
          "languages",
          "frameworks",
          "buildTools",
          "packageManagers",
          "runtimeDependencies",
        ],
        "RiskAssessment.json": ["items"],
        "DocCoverage.json": ["overallPercentage", "gaps", "stubs"],
        "MigrationOptions.json": ["options"],
        "ModernizationPlan.json": ["selectedOptionId", "phases"],
        "RunLogEvent.json": [
          "timestamp",
          "skill",
          "inputs",
          "outputs",
          "durationMs",
          "status",
        ],
      };

      for (const [file, fields] of Object.entries(requiredFields)) {
        const data = JSON.parse(
          fs.readFileSync(path.join(planDir, file), "utf-8"),
        );
        for (const field of fields) {
          expect(data, `${file} missing field "${field}"`).toHaveProperty(field);
        }
      }
    });
  });

  // ─── Helpers ───

  function writeMockPlanningArtifacts(runId: string): void {
    const planDir = path.join(artifactsDir, runId, "planning");
    fs.mkdirSync(planDir, { recursive: true });

    fs.writeFileSync(
      path.join(planDir, "ModernizationPlan.json"),
      JSON.stringify({ selectedOptionId: "default", phases: [] }),
    );
    fs.writeFileSync(
      path.join(planDir, "DependencyGraph.json"),
      JSON.stringify({ nodes: [], edges: [] }),
    );
    fs.writeFileSync(
      path.join(planDir, "StackAnalysis.json"),
      JSON.stringify({
        languages: [],
        frameworks: [],
        buildTools: [],
        packageManagers: [],
        runtimeDependencies: [],
      }),
    );
    fs.writeFileSync(
      path.join(planDir, "RiskAssessment.json"),
      JSON.stringify({ items: [] }),
    );
  }
});
